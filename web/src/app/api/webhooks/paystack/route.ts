import { after, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyWebhookSignature } from "@/lib/payments/paystack";

// Paystack webhook receiver (PLANS.md 5.6, founder-directed 2026-08-21).
// This is the only thing that ever grants or extends Engage access — a
// checkout-callback redirect (dashboard/subscribe/callback) is UX-only
// feedback, never trusted on its own. Mirrors the exact ack-fast-then-
// process-after pattern and x-hub-signature-256-style HMAC verification
// already proven in api/channels/instagram/webhook/route.ts.

type PaystackEvent = {
  event: string;
  data: {
    reference?: string;
    amount?: number;
    status?: string;
    plan?: string | null;
    plan_object?: { plan_code?: string } | null;
    customer?: { customer_code?: string; email?: string } | null;
    metadata?: { business_id?: string; product?: string; recover_plan_id?: string } | null;
    subscription_code?: string;
  };
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: PaystackEvent;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("Paystack webhook: body was not valid JSON", rawBody.slice(0, 500));
    return new Response("OK", { status: 200 });
  }

  // Paystack retries on non-200 — ack immediately, process after, same
  // discipline as the Instagram webhook (a slow/failing downstream step
  // must never cause Paystack to redeliver the same event repeatedly).
  after(() => processEvent(payload).catch((err) => console.error("Paystack webhook processing failed", err)));

  return new Response("OK", { status: 200 });
}

async function processEvent(payload: PaystackEvent): Promise<void> {
  const { event, data } = payload;
  const businessId = data.metadata?.business_id;

  if (!businessId) {
    console.error(`Paystack webhook: ${event} event had no business_id in metadata, cannot act on it`);
    return;
  }

  const supabase = createServiceRoleClient();

  if (event === "charge.success" && data.metadata?.product === "recover") {
    const reference = data.reference;
    const recoverPlanId = data.metadata?.recover_plan_id;
    if (!reference || !recoverPlanId) return;

    const { data: recoverPlan } = await supabase
      .from("recover_plans")
      .select("id, lookback_months")
      .eq("id", recoverPlanId)
      .maybeSingle();
    if (!recoverPlan) {
      console.error(`Paystack webhook: recover_plan_id ${recoverPlanId} not found`);
      return;
    }

    // Idempotent on paystack_reference, same as the Engage payments insert
    // below — a redelivered event is a no-op conflict, not a double-grant.
    // No businesses UPDATE here: unlike Engage this is a one-time charge,
    // not a subscription, so there's no plan_id/plan_status/
    // current_period_end to set — access is derived from the existence of
    // this row (see RecoverDashboardView/dashboard/recover/page.tsx).
    const { error: insertError } = await supabase.from("recover_purchases").insert({
      business_id: businessId,
      recover_plan_id: recoverPlan.id,
      paystack_reference: reference,
      amount_kobo: data.amount ?? 0,
      lookback_months: recoverPlan.lookback_months,
    });
    if (insertError && insertError.code !== "23505") {
      console.error("Paystack webhook: failed to record Recover purchase", insertError);
    }
    return;
  }

  if (event === "charge.success") {
    const reference = data.reference;
    if (!reference) return;

    const planCode = data.plan ?? data.plan_object?.plan_code ?? null;
    const { data: plan } = planCode
      ? await supabase.from("plans").select("id").eq("paystack_plan_code", planCode).maybeSingle()
      : { data: null };

    // payments.paystack_reference is unique — a redelivered event (Paystack
    // retries on any non-200, and webhooks can legitimately be sent more
    // than once for the same event) is naturally a no-op insert conflict
    // rather than double-counting a payment or re-extending the period.
    const { error: insertError } = await supabase.from("payments").insert({
      business_id: businessId,
      paystack_reference: reference,
      amount_kobo: data.amount ?? 0,
      status: "success",
      plan_id: plan?.id ?? null,
    });
    if (insertError && insertError.code !== "23505") {
      console.error("Paystack webhook: failed to record payment", insertError);
      return;
    }
    if (insertError?.code === "23505") return; // already processed this exact reference

    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await supabase
      .from("businesses")
      .update({
        plan_id: plan?.id ?? null,
        plan_status: "active",
        paystack_customer_code: data.customer?.customer_code ?? null,
        paystack_subscription_code: data.subscription_code ?? null,
        current_period_end: periodEnd.toISOString(),
      })
      .eq("id", businessId);
    return;
  }

  if (event === "subscription.disable" || event === "subscription.not_renew") {
    await supabase.from("businesses").update({ plan_status: "canceled" }).eq("id", businessId);
    return;
  }

  if (event === "invoice.payment_failed") {
    await supabase.from("businesses").update({ plan_status: "past_due" }).eq("id", businessId);
    return;
  }
}

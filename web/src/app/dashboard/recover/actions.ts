"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { initializeTransaction } from "@/lib/payments/paystack";
import { getSiteUrl } from "@/lib/site-url";
import type { ActionResult } from "../actions";

// Mirrors startSubscription in ../actions.ts, but as a one-time charge, not
// a recurring subscription: no planCode is passed (per initializeTransaction's
// own comment in lib/payments/paystack.ts, omitting planCode makes
// amountKobo the actual charge), and metadata carries `product: "recover"`
// so the webhook (api/webhooks/paystack/route.ts) can branch away from the
// Engage-subscription logic instead of running it against a one-off charge.
// Real access is never granted here or on the billing callback — only the
// webhook, since it's the only party that has actually confirmed payment.
export async function startRecoverPurchase(businessId: string, recoverPlanId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("contact_email")
    .eq("id", businessId)
    .maybeSingle();
  if (!business) return { ok: false, message: "Could not start checkout — check you have access to this business." };

  const { data: claims } = await supabase.auth.getClaims();
  const userEmail = claims?.claims?.email as string | undefined;
  const email = business.contact_email || userEmail;
  if (!email) {
    return { ok: false, message: "No email on file to send the receipt to — add a contact email in Settings first." };
  }

  const { data: plan } = await supabase
    .from("recover_plans")
    .select("id, price_kobo")
    .eq("id", recoverPlanId)
    .maybeSingle();
  if (!plan) {
    return { ok: false, message: "This tier isn't available anymore — please refresh and pick another." };
  }

  let authorizationUrl: string;
  try {
    const result = await initializeTransaction({
      email,
      amountKobo: plan.price_kobo,
      callbackUrl: `${getSiteUrl()}/dashboard/billing/callback`,
      metadata: { business_id: businessId, product: "recover", recover_plan_id: plan.id },
    });
    authorizationUrl = result.authorizationUrl;
  } catch (error) {
    console.error("Paystack initialize-transaction failed (Recover)", error);
    return { ok: false, message: "Could not start checkout — please try again." };
  }

  redirect(authorizationUrl);
}

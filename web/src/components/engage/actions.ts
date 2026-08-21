"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { handleInboundMessage, takeConversation, type InboundResult } from "@/lib/prevent/process";

export type SimulateResult = { ok: boolean; message: string };

// Moved 2026-08-15 from app/admin/prevent/[businessId]/actions.ts as part of
// the route restructure (PLANS.md Phase 5.0) — this is now the one
// canonical copy, reachable from both /admin/engage/[businessId] (founder)
// and /dashboard/engage (business owner, no businessId in the URL). Every
// write revalidates both possible paths unconditionally rather than
// threading a "which route called this" parameter through every action —
// simpler, and the cost of revalidating an unused path is negligible.

// This action drives a real, paid model call. Since Phase 4 opened
// self-service signup, it is reachable by anyone who can receive a magic
// link — not just the founder — so it needs the same abuse controls as any
// other public-ish endpoint. Without these, a throwaway account could
// script it in a loop and burn model spend.
const MAX_MESSAGE_LENGTH = 2000;
const SIMULATE_RATE_LIMIT = { max: 30, windowMinutes: 60 };

function revalidateEngagePaths(businessId: string) {
  revalidatePath(`/admin/engage/${businessId}`);
  revalidatePath("/dashboard/engage");
}

// Stand-in for the live WhatsApp webhook, which doesn't exist yet (blocked
// on DEP-1/DEP-2). Instagram now has a real webhook (Phase 5.2) — this
// remains useful for WhatsApp and for testing without a real customer
// message. Drives the exact same handleInboundMessage() code path a real
// webhook handler calls.
export async function simulateInboundMessage(
  businessId: string,
  _prevState: SimulateResult,
  formData: FormData,
): Promise<SimulateResult> {
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const messageBody = String(formData.get("message") ?? "").trim();
  if (!customerName || !messageBody) return { ok: false, message: "Customer name and message are required." };
  if (customerName.length > 100) return { ok: false, message: "Customer name is too long." };
  if (messageBody.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, message: `Message must be under ${MAX_MESSAGE_LENGTH} characters.` };
  }

  const supabase = await createClient();

  // Confirm membership BEFORE touching the rate limiter. The limiter is
  // keyed by business, so checking it first would let anyone burn an
  // arbitrary tenant's hourly quota just by posting their business id —
  // turning an abuse control into a denial-of-service vector against them.
  // This select is RLS-governed, so a non-member gets no row.
  const { data: business } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!business) return { ok: false, message: "No business visible with this ID." };

  // Keyed by business rather than user: the cost being protected is per
  // tenant, and a business's members share that budget.
  const { allowed } = await checkRateLimit(`prevent_simulate:${businessId}`, SIMULATE_RATE_LIMIT);
  if (!allowed) {
    return { ok: false, message: "Too many simulated messages in the last hour. Please try again later." };
  }

  let { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("business_id", businessId)
    .eq("name", customerName)
    .maybeSingle();

  let conversationId: string;

  if (!customer) {
    const { data: newCustomer, error: custError } = await supabase
      .from("customers")
      .insert({ business_id: businessId, name: customerName, source: "whatsapp_api" })
      .select("id")
      .single();
    if (custError || !newCustomer) return { ok: false, message: "Could not create customer." };
    customer = newCustomer;

    const { data: newConv, error: convError } = await supabase
      .from("conversations")
      .insert({
        business_id: businessId,
        customer_id: customer.id,
        channel: "whatsapp",
        source: "whatsapp_api",
        state: "new",
        first_message_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (convError || !newConv) return { ok: false, message: "Could not create conversation." };
    conversationId = newConv.id;
  } else {
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id")
      .eq("business_id", businessId)
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!existingConv) return { ok: false, message: "No conversation found for this customer." };
    conversationId = existingConv.id;
  }

  const { count: messageCountSoFar } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), message_count: (messageCountSoFar ?? 0) + 1 })
    .eq("id", conversationId);

  const result: InboundResult = await handleInboundMessage(supabase, businessId, conversationId, messageBody);

  revalidateEngagePaths(businessId);

  if (result.status === "responded") {
    return {
      ok: true,
      message: result.mediaUrl
        ? "AI responded from approved knowledge, with a media attachment."
        : "AI responded from approved knowledge.",
    };
  }
  if (result.status === "escalated") return { ok: true, message: `Escalated: ${result.reason}` };
  if (result.status === "billing_gated") return { ok: true, message: `Billing: ${result.reason}` };
  return { ok: true, message: "Suppressed — a human is already handling this conversation." };
}

export async function markTakeConversation(businessId: string, conversationId: string, assignedTo: string): Promise<SimulateResult> {
  if (!assignedTo.trim()) return { ok: false, message: "Enter who is taking this conversation." };
  const supabase = await createClient();
  await takeConversation(supabase, conversationId, assignedTo.trim());
  revalidateEngagePaths(businessId);
  return { ok: true, message: "Conversation taken — AI will not respond further." };
}

export async function closeConversation(businessId: string, conversationId: string): Promise<SimulateResult> {
  const supabase = await createClient();
  await supabase.from("conversations").update({ state: "closed" }).eq("id", conversationId);
  revalidateEngagePaths(businessId);
  return { ok: true, message: "Closed." };
}

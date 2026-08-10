"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { handleInboundMessage, takeConversation, type InboundResult } from "@/lib/prevent/process";

export type SimulateResult = { ok: boolean; message: string };

// Stand-in for the live WhatsApp/Instagram webhook, which doesn't exist
// yet (Phase 1.4b blocked on DEP-1/DEP-2/DEP-4). This is the same pattern
// as Phase 1.4a's file upload substituting for a live API — it drives the
// exact same handleInboundMessage() code path that a real webhook handler
// would call, so the engine/kill-switch/escalation logic is tested for
// real, not mocked.
export async function simulateInboundMessage(
  businessId: string,
  _prevState: SimulateResult,
  formData: FormData,
): Promise<SimulateResult> {
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const messageBody = String(formData.get("message") ?? "").trim();
  if (!customerName || !messageBody) return { ok: false, message: "Customer name and message are required." };

  const supabase = await createClient();

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

  revalidatePath(`/admin/prevent/${businessId}`);

  if (result.status === "responded") return { ok: true, message: "AI responded from approved knowledge." };
  if (result.status === "escalated") return { ok: true, message: `Escalated: ${result.reason}` };
  return { ok: true, message: "Suppressed — a human is already handling this conversation." };
}

export async function markTakeConversation(businessId: string, conversationId: string, assignedTo: string): Promise<SimulateResult> {
  if (!assignedTo.trim()) return { ok: false, message: "Enter who is taking this conversation." };
  const supabase = await createClient();
  await takeConversation(supabase, conversationId, assignedTo.trim());
  revalidatePath(`/admin/prevent/${businessId}`);
  return { ok: true, message: "Conversation taken — AI will not respond further." };
}

export async function closeConversation(businessId: string, conversationId: string): Promise<SimulateResult> {
  const supabase = await createClient();
  await supabase.from("conversations").update({ state: "closed" }).eq("id", conversationId);
  revalidatePath(`/admin/prevent/${businessId}`);
  return { ok: true, message: "Closed." };
}

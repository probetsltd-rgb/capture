import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processInboundMessage } from "./engine";

// The kill switch (PRD §23: "when a human takes over, AI stops") is
// enforced here, not just hidden behind a UI button — a conversation is
// re-checked for human takeover both BEFORE starting AI processing and
// AGAIN immediately before the AI's response is committed, discarding the
// response if a human took over while the model was "thinking" (a real
// generateObject call takes ~1-2s, a realistic window for this race).
// Tested directly against that race in TESTS.md, not just reasoned about.

async function isHumanActive(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("conversations")
    .select("state, human_taken_at")
    .eq("id", conversationId)
    .single();
  return data?.state === "human_handling" || data?.human_taken_at !== null;
}

// PRD §17D: merge newly-extracted fields onto the conversation, never
// clobbering a previously-captured value with a null from a later message
// that simply didn't repeat it.
async function mergeQualification(
  supabase: SupabaseClient,
  conversationId: string,
  extracted: Record<string, string | null>,
): Promise<void> {
  const { data } = await supabase.from("conversations").select("qualification").eq("id", conversationId).single();
  const existing = (data?.qualification as Record<string, string | null>) ?? {};
  const merged = { ...existing };
  for (const [key, value] of Object.entries(extracted)) {
    if (value) merged[key] = value;
  }
  await supabase.from("conversations").update({ qualification: merged }).eq("id", conversationId);
}

export type InboundResult =
  | { status: "responded" }
  | { status: "escalated"; reason: string }
  | { status: "suppressed_human_active" };

export async function handleInboundMessage(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  messageBody: string,
): Promise<InboundResult> {
  await supabase.from("messages").insert({
    business_id: businessId,
    conversation_id: conversationId,
    sender_type: "customer",
    body: messageBody,
    sent_at: new Date().toISOString(),
  });

  if (await isHumanActive(supabase, conversationId)) {
    return { status: "suppressed_human_active" };
  }

  // `.not("approved_at", "is", null)` is load-bearing, not a filter for
  // tidiness: vertical-template onboarding (Phase 4) seeds knowledge_items
  // with generic boilerplate no business ever confirmed. Answering from an
  // unapproved row would break the one guarantee Prevent makes — that every
  // statement to a customer came from knowledge the business approved.
  const [{ data: knowledge }, { data: business }] = await Promise.all([
    supabase
      .from("knowledge_items")
      .select("category, question, content")
      .eq("business_id", businessId)
      .not("approved_at", "is", null),
    supabase.from("businesses").select("escalation_keywords").eq("id", businessId).maybeSingle(),
  ]);
  const extraEscalationKeywords = (business?.escalation_keywords as string[] | null) ?? [];

  await supabase.from("conversations").update({ state: "ai_handling" }).eq("id", conversationId);

  const result = await processInboundMessage(messageBody, knowledge ?? [], extraEscalationKeywords);

  // Re-check immediately before committing — this is the actual kill
  // switch, not the pre-check above (which only prevents starting new work
  // on an already-human conversation, not a takeover mid-flight).
  if (await isHumanActive(supabase, conversationId)) {
    return { status: "suppressed_human_active" };
  }

  if (result?.qualification) {
    await mergeQualification(supabase, conversationId, result.qualification);
  }

  if (!result || result.escalate) {
    const reason = result?.escalation_reason ?? "could not generate a response from approved knowledge";
    await supabase
      .from("conversations")
      .update({ state: "human_required", escalation_reason: reason, escalated_at: new Date().toISOString() })
      .eq("id", conversationId);
    return { status: "escalated", reason };
  }

  await supabase.from("messages").insert({
    business_id: businessId,
    conversation_id: conversationId,
    sender_type: "ai",
    body: result.response,
    sent_at: new Date().toISOString(),
  });
  await supabase.from("conversations").update({ state: "ai_handling" }).eq("id", conversationId);
  return { status: "responded" };
}

// PRD §23: selecting "Take Conversation" stops AI immediately. This is the
// only thing that sets human_taken_at — the single source of truth the
// kill switch checks.
export async function takeConversation(
  supabase: SupabaseClient,
  conversationId: string,
  assignedTo: string,
): Promise<void> {
  await supabase
    .from("conversations")
    .update({ state: "human_handling", human_taken_at: new Date().toISOString(), assigned_to: assignedTo })
    .eq("id", conversationId);
}

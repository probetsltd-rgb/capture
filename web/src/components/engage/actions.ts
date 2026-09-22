"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { handleInboundMessage, takeConversation, releaseToAI, type InboundResult } from "@/lib/prevent/process";
import { sendHumanReply } from "@/lib/prevent/human-reply";
import { extractKnowledgeItems } from "@/lib/ingest/brochure-extract";
import { redactPii } from "@/lib/classification/redact";

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

// Assignee is resolved from the signed-in session, not a free-typed name
// (a real gap this used to have — anyone at the keyboard could type any
// name, and it had no link back to an actual account). Uses email since
// that's the one identity field already proven available from claims
// elsewhere (admin/page.tsx, onboarding/page.tsx) — no separate "display
// name" field exists on business_members or auth.users to prefer instead.
export async function markTakeConversation(businessId: string, conversationId: string): Promise<SimulateResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const email = claims?.claims?.email as string | undefined;
  if (!email) return { ok: false, message: "Not signed in." };

  await takeConversation(supabase, conversationId, email);
  revalidateEngagePaths(businessId);
  return { ok: true, message: "Conversation taken — AI will not respond further." };
}

// Founder request 2026-09-14: the kill switch is permanent by default (see
// process.ts's top-of-file note) — this is the one deliberate way to
// reverse it, always an explicit click, never automatic. RLS-governed
// pre-check before falling through to releaseToAI, same discipline as
// sendConversationReply below.
export async function releaseConversationToAI(businessId: string, conversationId: string): Promise<SimulateResult> {
  const supabase = await createClient();
  const { data: business } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!business) return { ok: false, message: "No business visible with this ID." };

  const result = await releaseToAI(supabase, businessId, conversationId);
  revalidateEngagePaths(businessId);

  if (result.status === "responded") return { ok: true, message: "Released — Engage answered the customer's unanswered message." };
  if (result.status === "escalated") return { ok: true, message: `Released — but Engage re-escalated it: ${result.reason}` };
  if (result.status === "billing_gated") return { ok: true, message: `Released — but billing is gated: ${result.reason}` };
  return { ok: true, message: "Released back to Engage." };
}

export async function closeConversation(businessId: string, conversationId: string): Promise<SimulateResult> {
  const supabase = await createClient();
  await supabase.from("conversations").update({ state: "closed" }).eq("id", conversationId);
  await extractKnowledgeFromTeamReplies(supabase, businessId, conversationId);
  revalidateEngagePaths(businessId);
  return { ok: true, message: "Closed." };
}

// Founder decision 2026-09-07: reuses extractKnowledgeItems (already proven
// on the 30-day historical import, lib/channels/instagram.ts's
// seedKnowledgeFromHistory) against a single conversation's own team
// replies once it's closed — a team member typing an answer live is the
// same kind of "stated fact" signal as a past reply pulled from history,
// just scoped to one conversation instead of a whole account. Proposals
// land in the exact same pending-review queue (approved_at: null) as every
// other source — this never lets a live reply teach the AI anything
// without a human confirming it first, keeping the "never guesses" gate
// intact.
//
// Gated on team_knowledge_extracted_at (mirrors businesses.
// knowledge_base_seeded_at) so re-closing an already-processed conversation
// is a no-op, not a repeat model call. Runs at close, not per-reply — cheap
// relative to a live reply, and consolidates a whole conversation's replies
// in one extraction pass the same way the historical seed consolidates
// many conversations' worth.
async function extractKnowledgeFromTeamReplies(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  conversationId: string,
): Promise<void> {
  const { data: conversation } = await supabase
    .from("conversations")
    .select("team_knowledge_extracted_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation || conversation.team_knowledge_extracted_at) return;

  const { data: messages } = await supabase
    .from("messages")
    .select("body")
    .eq("conversation_id", conversationId)
    .eq("sender_type", "business")
    .not("body", "is", null);

  // Mark extracted regardless of outcome (including "no team replies") —
  // one-time-per-conversation, not retry-until-something-is-found, same
  // reasoning as knowledge_base_seeded_at.
  await supabase
    .from("conversations")
    .update({ team_knowledge_extracted_at: new Date().toISOString() })
    .eq("id", conversationId);

  const replies = (messages ?? [])
    .map((m) => m.body as string)
    .filter((body) => body.trim().length > 0)
    .map((body) => redactPii(body));
  if (replies.length === 0) return;

  const items = await extractKnowledgeItems(replies.join("\n\n"), "conversation_history");
  if (!items || items.length === 0) return;

  await supabase.from("knowledge_items").insert(
    items.map((item) => ({
      business_id: businessId,
      category: item.category,
      question: null,
      content: item.content,
      media_url: null,
      approved_at: null, // pending review, same as brochure/historical items
      source: "conversation_close",
    })),
  );
}

export type ConversationMessage = { sender_type: string; body: string | null; sent_at: string };

// Founder-reported 2026-09-07: a team member watching an open thread
// (ConversationRow's MessageThread) never saw a customer's new message
// arrive — the row is rendered once from EngageDashboardView's server-side
// fetch and nothing ever asked for fresher data afterward. Polling rather
// than Supabase Realtime: nothing else in this codebase uses Realtime yet,
// and at real current scale (TESTS.md: Rentit's 42 conversations/281
// messages) a plain re-fetch every few seconds, only while a thread is
// actually open, is simpler than standing up a new subscription mechanism
// for one screen.
export async function getConversationMessages(
  businessId: string,
  conversationId: string,
): Promise<ConversationMessage[]> {
  const supabase = await createClient();
  const { data: business } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!business) return [];

  const { data } = await supabase
    .from("messages")
    .select("sender_type, body, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true });
  return data ?? [];
}

// Sends a human team member's typed reply to the customer. RLS-governed
// pre-check (a non-member gets no row back) before falling through to
// sendHumanReply's service-role work, same discipline as
// disconnectInstagramAction/deleteInstagramDataAction in dashboard/actions.ts.
export async function sendConversationReply(
  businessId: string,
  conversationId: string,
  text: string,
): Promise<SimulateResult> {
  const supabase = await createClient();
  const { data: business } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!business) return { ok: false, message: "No business visible with this ID." };

  const result = await sendHumanReply(businessId, conversationId, text);
  revalidateEngagePaths(businessId);
  return result;
}

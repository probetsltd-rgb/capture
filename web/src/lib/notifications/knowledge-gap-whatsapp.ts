import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { decryptToken } from "@/lib/channels/token-crypto";
import { sendTemplateMessage, sendMessage } from "@/lib/channels/whatsapp-api";
import { recordKnowledgeGapQuestionRoute } from "@/lib/notifications/whatsapp-reply-routing";

// "Update the knowledge base via WhatsApp" flow 1 (scoped in chat
// 2026-09-25): a business's knowledge_gap_questions (today only produced
// by seedKnowledgeFromHistory) get pushed to the single highest-priority
// team member's WhatsApp instead of sitting only in the dashboard's
// KnowledgeGapQuestions list — answering IS the approval, same rule
// answerKnowledgeGapQuestion already applies for the web form. Sends from
// Capture's own shared WhatsApp number, same as escalation/handler
// notifications (WHATSAPP_NOTIFICATION_BUSINESS_ID) — a business's own
// connected WhatsApp number stays purely for customer ingestion.
//
// Deliberately no timeout/second-recipient escalation (a real product
// idea, explicitly deferred): Vercel Cron on the Hobby plan runs at most
// once a day (DEP-10, still open) — the existing escalation-timers/
// handler-reminders crons already hit this wall, so a time-based
// escalation built today would silently behave as "escalates once a day
// at most," not the real SLA it would look like from the code. Revisit
// once DEP-10 clears.
// v3: v1 ("Capture has a question about your business") and v2 ("setup
// found a gap... reply with the answer") both got auto-reclassified by
// Meta from the requested UTILITY to MARKETING (stricter opt-in/delivery
// rules, ~6x the per-message cost) — v2 despite using the same "tie it to
// a setup action" framing that worked for flow 2's templates
// (knowledge-review-whatsapp.ts). Working theory: it's the OPEN-ENDED
// free-text solicitation ("reply with the answer") that reads as
// survey/engagement to Meta's classifier, not the wording around it —
// their own utility criteria tie feedback-survey eligibility to a
// specific existing order, which a knowledge gap has none of. v3
// reframes as an account-completion ALERT (a missing field, closer to
// Meta's explicit "account alerts" utility example) rather than a
// question being posed, even though the substituted {{1}} content is
// still literally a question — the surrounding language states what's
// missing instead of asking for it. Templates can't be deleted via the
// API once created — knowledge_gap_question and _v2 are left in place,
// unreferenced, same precedent as escalation_alert -> escalation_alert_v2.
const TEMPLATE_NAME = "knowledge_gap_question_v3";
const TEMPLATE_LANGUAGE = "en_US";
const NOTIFICATION_BUSINESS_ID = process.env.WHATSAPP_NOTIFICATION_BUSINESS_ID;

// Same ordering as escalation-whatsapp.ts's own copy — duplicated
// deliberately rather than shared, matching this codebase's existing
// per-module duplication of small constants (e.g. inferMediaType repeated
// in each channel's *-api.ts) over a cross-import for one tiny table.
const ROLE_PRIORITY: Record<string, number> = { owner: 0, admin: 1, staff: 2 };

async function getTopPriorityRecipient(businessId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data: members } = await supabase
    .from("business_members")
    .select("whatsapp_number, role, created_at")
    .eq("business_id", businessId)
    .not("whatsapp_number", "is", null);
  if (!members || members.length === 0) return null;

  const ordered = [...members].sort((a, b) => {
    const roleDiff = (ROLE_PRIORITY[a.role] ?? 99) - (ROLE_PRIORITY[b.role] ?? 99);
    if (roleDiff !== 0) return roleDiff;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  return ordered[0].whatsapp_number as string;
}

// One question in flight per business at a time — called after a
// question is answered/dismissed (via WhatsApp below, or the dashboard's
// answerKnowledgeGapQuestion/dismissKnowledgeGapQuestion) and once after a
// fresh seed run, so the queue advances on its own without any cron.
// Deliberately never throws — same "a courtesy notification's failure
// must never block the real write it's attached to" discipline as
// sendEscalationWhatsApp/notifyChannelConnectionChange.
export async function sendNextPendingGapQuestion(businessId: string): Promise<void> {
  try {
    if (!NOTIFICATION_BUSINESS_ID) {
      console.error("Gap question WhatsApp send skipped: WHATSAPP_NOTIFICATION_BUSINESS_ID is not set");
      return;
    }
    const supabase = createServiceRoleClient();

    const { data: inFlight } = await supabase
      .from("knowledge_gap_questions")
      .select("id")
      .eq("business_id", businessId)
      .eq("status", "pending")
      .not("sent_at", "is", null)
      .limit(1)
      .maybeSingle();
    if (inFlight) return; // something's already out for a reply — wait for it

    const { data: next } = await supabase
      .from("knowledge_gap_questions")
      .select("id, question")
      .eq("business_id", businessId)
      .eq("status", "pending")
      .is("sent_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!next) return; // nothing pending, or everything pending has already exhausted this path once

    const recipient = await getTopPriorityRecipient(businessId);
    if (!recipient) return; // nobody to send to — stays pending, still visible on the dashboard

    const { data: connection } = await supabase
      .from("channel_connections")
      .select("access_token_encrypted, external_account_id")
      .eq("business_id", NOTIFICATION_BUSINESS_ID)
      .eq("channel", "whatsapp")
      .is("disconnected_at", null)
      .maybeSingle();
    if (!connection) return; // Capture's own platform WhatsApp number isn't connected

    const accessToken = decryptToken(connection.access_token_encrypted);
    const whatsappMessageId = await sendTemplateMessage(
      accessToken,
      connection.external_account_id,
      recipient,
      TEMPLATE_NAME,
      TEMPLATE_LANGUAGE,
      [next.question],
    );
    if (!whatsappMessageId) return;

    await recordKnowledgeGapQuestionRoute({
      businessId,
      knowledgeGapQuestionId: next.id,
      whatsappMessageId,
      recipientWaId: recipient,
    });
    await supabase.from("knowledge_gap_questions").update({ sent_at: new Date().toISOString() }).eq("id", next.id);
  } catch (err) {
    console.error("sendNextPendingGapQuestion threw unexpectedly", { businessId, err });
  }
}

// Called by the WhatsApp webhook once resolveKnowledgeGapQuestionRoute
// matches an inbound reply. Mirrors answerKnowledgeGapQuestion/
// dismissKnowledgeGapQuestion (components/engage/knowledge/actions.ts)
// but as a service-role equivalent with no session to check — caller
// (the webhook) has already verified the reply came from the exact phone
// number this specific question was sent to (resolveKnowledgeGapQuestionRoute's
// own recipient-match check), same trust boundary as sendHumanReply.
// Self-contained (sends its own ack), same shape as sendHumanReply, rather
// than returning text for the webhook route to send — the reply just
// opened a real 24h session from this number, so the ack goes as plain
// text, no template needed for it.
export async function handleGapQuestionWhatsAppReply(
  businessId: string,
  knowledgeGapQuestionId: string,
  replyText: string,
  recipientWaId: string,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const trimmed = replyText.trim();

  const { data: question } = await supabase
    .from("knowledge_gap_questions")
    .select("id, category, question, status")
    .eq("id", knowledgeGapQuestionId)
    .eq("business_id", businessId)
    .maybeSingle();

  let ackText: string;

  // Already resolved (answered on the dashboard, a duplicate webhook
  // redelivery, or a second reply after the first already went through) —
  // idempotent no-op, same discipline as dismissKnowledgeGapQuestion's
  // `.eq("status", "pending")` guard.
  if (!question || question.status !== "pending") {
    ackText = "That question isn't open anymore — thanks anyway!";
  } else if (trimmed.toUpperCase() === "SKIP") {
    await supabase.from("knowledge_gap_questions").update({ status: "dismissed" }).eq("id", question.id);
    void sendNextPendingGapQuestion(businessId);
    ackText = "Skipped.";
  } else if (!trimmed) {
    ackText = `Please reply with an answer to: "${question.question}" — or reply SKIP.`;
  } else {
    const { data: newItem, error: insertError } = await supabase
      .from("knowledge_items")
      .insert({
        business_id: businessId,
        category: question.category,
        question: question.question,
        content: trimmed,
        media_url: null,
        approved_at: new Date().toISOString(),
        source: "whatsapp_gap_answer",
      })
      .select("id")
      .single();

    if (insertError || !newItem) {
      console.error("Failed to save gap-question WhatsApp answer", { businessId, knowledgeGapQuestionId, insertError });
      ackText = "Sorry, that didn't save — please try again.";
    } else {
      await supabase
        .from("knowledge_gap_questions")
        .update({ status: "answered", answered_at: new Date().toISOString(), resulting_knowledge_item_id: newItem.id })
        .eq("id", question.id);
      void sendNextPendingGapQuestion(businessId);
      ackText = "Got it, saved — the AI can use that right away.";
    }
  }

  if (!NOTIFICATION_BUSINESS_ID) return;
  const supabaseForSend = createServiceRoleClient();
  const { data: connection } = await supabaseForSend
    .from("channel_connections")
    .select("access_token_encrypted, external_account_id")
    .eq("business_id", NOTIFICATION_BUSINESS_ID)
    .eq("channel", "whatsapp")
    .is("disconnected_at", null)
    .maybeSingle();
  if (!connection) return;

  try {
    await sendMessage(decryptToken(connection.access_token_encrypted), connection.external_account_id, recipientWaId, ackText);
  } catch (err) {
    console.error("Gap question WhatsApp ack send failed", { businessId, knowledgeGapQuestionId, err });
  }
}

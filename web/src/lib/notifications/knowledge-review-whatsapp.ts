import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { decryptToken } from "@/lib/channels/token-crypto";
import { sendTemplateMessage, sendMessage } from "@/lib/channels/whatsapp-api";
import { getSiteUrl } from "@/lib/site-url";

// "Update the knowledge base via WhatsApp" flow 2 (scoped in chat
// 2026-09-25, Option B, threshold 7): called right after any code path
// inserts a batch of new pending knowledge_items (uploadBrochure,
// extractKnowledgeFromWebsite, applyVerticalTemplate,
// extractKnowledgeFromTeamReplies, seedKnowledgeFromHistory). A batch of
// <= 7 items gets a numbered, repliable digest; a larger one just gets a
// "N items pending, check the dashboard" notice — bulk-approving a large
// batch blind off a phone screen isn't a good review experience even
// where technically possible, so it isn't built. Same single-recipient
// model as flow 1 (knowledge-gap-whatsapp.ts): highest-priority team
// member only, no timeout/second-recipient escalation (DEP-10).
const DIGEST_TEMPLATE_NAME = "knowledge_review_digest";
const NOTICE_TEMPLATE_NAME = "knowledge_review_pending_notice";
const TEMPLATE_LANGUAGE = "en_US";
const NOTIFICATION_BUSINESS_ID = process.env.WHATSAPP_NOTIFICATION_BUSINESS_ID;
const DIGEST_THRESHOLD = 7;
const ITEM_SNIPPET_LENGTH = 60;

// Duplicated from knowledge-gap-whatsapp.ts/escalation-whatsapp.ts rather
// than shared — matches this codebase's existing per-module duplication
// of small constants/helpers (e.g. inferMediaType repeated per channel).
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

// WhatsApp template PARAMETER values cannot contain newlines, tabs, or 4+
// consecutive spaces (confirmed against Meta's current template-parameter
// rules before building this, not assumed from the static-body newlines
// escalation_alert_v2 already uses — those are baked into the approved
// template text itself, a different thing from a dynamic {{1}} value) —
// so a numbered list has to be one line, joined with a plain separator
// rather than "\n" per item.
export type PendingItemForNotify = { id: string; category: string; content: string };

function buildDigestText(items: PendingItemForNotify[]): string {
  return items
    .map((item, i) => {
      const snippet = item.content.length > ITEM_SNIPPET_LENGTH ? item.content.slice(0, ITEM_SNIPPET_LENGTH - 1) + "…" : item.content;
      return `${i + 1}. [${item.category}] ${snippet}`;
    })
    .join("  ·  ");
}

// Deliberately never throws — same "a courtesy notification's failure
// must never block the real write it's attached to" discipline as every
// other notification module here. Called with exactly the rows a caller
// just inserted, not a recomputed "all pending items" total — so a
// digest/notice is always about one concrete batch, never a stale or
// double-counted one.
export async function notifyPendingKnowledgeItems(businessId: string, insertedItems: PendingItemForNotify[]): Promise<void> {
  try {
    if (insertedItems.length === 0) return;
    if (!NOTIFICATION_BUSINESS_ID) {
      console.error("Knowledge review WhatsApp notify skipped: WHATSAPP_NOTIFICATION_BUSINESS_ID is not set");
      return;
    }

    const recipient = await getTopPriorityRecipient(businessId);
    if (!recipient) return;

    const supabase = createServiceRoleClient();
    const { data: connection } = await supabase
      .from("channel_connections")
      .select("access_token_encrypted, external_account_id")
      .eq("business_id", NOTIFICATION_BUSINESS_ID)
      .eq("channel", "whatsapp")
      .is("disconnected_at", null)
      .maybeSingle();
    if (!connection) return;

    const accessToken = decryptToken(connection.access_token_encrypted);

    if (insertedItems.length <= DIGEST_THRESHOLD) {
      const whatsappMessageId = await sendTemplateMessage(
        accessToken,
        connection.external_account_id,
        recipient,
        DIGEST_TEMPLATE_NAME,
        TEMPLATE_LANGUAGE,
        [buildDigestText(insertedItems)],
      );
      if (!whatsappMessageId) return;

      const { error } = await supabase.from("knowledge_review_digests").insert({
        business_id: businessId,
        whatsapp_message_id: whatsappMessageId,
        recipient_wa_id: recipient,
        item_ids: insertedItems.map((i) => i.id),
      });
      if (error) console.error("Failed to record knowledge review digest", { businessId, error });
    } else {
      await sendTemplateMessage(
        accessToken,
        connection.external_account_id,
        recipient,
        NOTICE_TEMPLATE_NAME,
        TEMPLATE_LANGUAGE,
        [String(insertedItems.length), `${getSiteUrl()}/dashboard/engage/knowledge`],
      );
      // No correlation row — informational only, nothing to reply to.
    }
  } catch (err) {
    console.error("notifyPendingKnowledgeItems threw unexpectedly", { businessId, err });
  }
}

const APPROVE_ALL_RE = /^approve\s+all$/i;
const APPROVE_SOME_RE = /^approve\s+([\d,\s]+)$/i;

// Called by the WhatsApp webhook once resolveKnowledgeReviewDigestRoute
// matches an inbound reply. No reject/delete path via WhatsApp by design
// (scoped in chat) — a reply can only approve, same "never let a chat
// reply do anything destructive" discipline as flow 1's SKIP only ever
// dismissing, never deleting. Self-contained (sends its own ack), same
// shape as handleGapQuestionWhatsAppReply/sendHumanReply.
export async function handleKnowledgeReviewDigestReply(
  businessId: string,
  itemIds: string[],
  replyText: string,
  recipientWaId: string,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const trimmed = replyText.trim();

  let ackText: string;
  let targetIds: string[] = [];

  if (APPROVE_ALL_RE.test(trimmed)) {
    targetIds = itemIds;
  } else {
    const match = trimmed.match(APPROVE_SOME_RE);
    if (match) {
      const positions = [...new Set(match[1].split(",").map((s) => parseInt(s.trim(), 10)))].filter(
        (n) => Number.isInteger(n) && n >= 1 && n <= itemIds.length,
      );
      targetIds = positions.map((p) => itemIds[p - 1]);
    }
  }

  if (targetIds.length === 0) {
    ackText = `Reply "approve" with the numbers to add them (e.g. approve 1,3), or "approve all".`;
  } else {
    // approved_at IS NULL guard: idempotent against a duplicate webhook
    // redelivery or an item already approved/deleted separately (e.g. on
    // the dashboard) between the digest being sent and this reply.
    const { data: updated, error } = await supabase
      .from("knowledge_items")
      .update({ approved_at: new Date().toISOString() })
      .in("id", targetIds)
      .eq("business_id", businessId)
      .is("approved_at", null)
      .select("id");

    if (error) {
      console.error("Failed to approve knowledge items from WhatsApp reply", { businessId, error });
      ackText = "Sorry, that didn't go through — please try again.";
    } else {
      const approvedCount = updated?.length ?? 0;
      const alreadyResolvedCount = targetIds.length - approvedCount;
      ackText =
        approvedCount === 0
          ? "Those items were already resolved — nothing to approve."
          : `Approved ${approvedCount} item${approvedCount === 1 ? "" : "s"} — the AI can use ${approvedCount === 1 ? "it" : "them"} now.` +
            (alreadyResolvedCount > 0 ? ` (${alreadyResolvedCount} were already resolved.)` : "");
    }
  }

  if (!NOTIFICATION_BUSINESS_ID) return;
  const { data: connection } = await supabase
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
    console.error("Knowledge review digest ack send failed", { businessId, err });
  }
}

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { decryptToken } from "@/lib/channels/token-crypto";
import { sendTemplateMessage } from "@/lib/channels/whatsapp-api";

// Founder request 2026-09-08 — the settings page has promised this since
// 2026-09-02 ("Add your WhatsApp number so escalation alerts can reach you
// there in future — email works today"); this is "in future" arriving.
// Additive alongside email (`escalation-email.ts`), never a replacement —
// a member with no WhatsApp number set just doesn't get this one, they
// still get email. Uses the real, Meta-approved-pending `escalation_alert`
// template (id 1616066190242207, submitted same day) since a team
// member's phone has essentially never messaged Capture's business
// number, so this is a business-initiated send outside any 24h session
// window — plain text would be rejected.
const TEMPLATE_NAME = "escalation_alert";
const TEMPLATE_LANGUAGE = "en_US";
const MAX_MESSAGE_SNIPPET_LENGTH = 150;

const CHANNEL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  other: "Other",
};

// Same role-priority ordering as escalation-email.ts's
// getBusinessRecipientEmails, but filtered to members who've actually set
// a WhatsApp number — deliberately a separate function rather than a
// shared one returning both email+phone, since the two recipient lists
// can genuinely differ (a member with an email but no phone set) and
// forcing one shape would make that harder to reason about, not easier.
const ROLE_PRIORITY: Record<string, number> = { owner: 0, admin: 1, staff: 2 };

async function getBusinessRecipientPhones(businessId: string, recipientLimit: number | null): Promise<string[]> {
  const supabase = createServiceRoleClient();
  const { data: members } = await supabase
    .from("business_members")
    .select("whatsapp_number, role, created_at")
    .eq("business_id", businessId)
    .not("whatsapp_number", "is", null);
  if (!members || members.length === 0) return [];

  const ordered = [...members].sort((a, b) => {
    const roleDiff = (ROLE_PRIORITY[a.role] ?? 99) - (ROLE_PRIORITY[b.role] ?? 99);
    if (roleDiff !== 0) return roleDiff;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  const selected = recipientLimit != null ? ordered.slice(0, recipientLimit) : ordered;
  return selected.map((m) => m.whatsapp_number as string);
}

export type EscalationWhatsAppNotification = {
  businessId: string;
  customerName: string | null;
  channel: string;
  messageBody: string;
  conversationUrl: string;
  recipientLimit: number | null;
};

// Deliberately never throws — same discipline as sendEscalationNotification
// (the conversation is already correctly marked human_required by the time
// this runs; this is a courtesy notification on top of that real
// guarantee, not part of it). Silently does nothing if the business has no
// active WhatsApp connection (nothing to send *from*) or no member has set
// a WhatsApp number (nothing to send *to*) — neither is an error, both are
// just "this channel isn't set up for this business yet."
export async function sendEscalationWhatsApp(notification: EscalationWhatsAppNotification): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { data: connection } = await supabase
      .from("channel_connections")
      .select("access_token_encrypted, external_account_id")
      .eq("business_id", notification.businessId)
      .eq("channel", "whatsapp")
      .is("disconnected_at", null)
      .maybeSingle();
    if (!connection) return; // no WhatsApp connected — email is the only channel for this business today

    const phones = await getBusinessRecipientPhones(notification.businessId, notification.recipientLimit);
    if (phones.length === 0) return; // no team member has set a notification number yet

    const accessToken = decryptToken(connection.access_token_encrypted);
    const snippet =
      notification.messageBody.length > MAX_MESSAGE_SNIPPET_LENGTH
        ? notification.messageBody.slice(0, MAX_MESSAGE_SNIPPET_LENGTH - 1) + "…"
        : notification.messageBody;
    const params = [
      notification.customerName ?? "A customer",
      CHANNEL_LABEL[notification.channel] ?? notification.channel,
      snippet,
      notification.conversationUrl,
    ];

    for (const phone of phones) {
      try {
        await sendTemplateMessage(accessToken, connection.external_account_id, phone, TEMPLATE_NAME, TEMPLATE_LANGUAGE, params);
      } catch (err) {
        // One recipient's failure (e.g. a malformed number) must not stop
        // the rest — same per-recipient isolation as every other loop in
        // this codebase (historical fetch, escalation timers).
        console.error("WhatsApp escalation send failed for one recipient", { businessId: notification.businessId, err });
      }
    }
  } catch (err) {
    console.error("WhatsApp escalation notification threw unexpectedly", { businessId: notification.businessId, err });
  }
}

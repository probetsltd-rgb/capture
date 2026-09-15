import "server-only";
import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { decryptToken } from "@/lib/channels/token-crypto";
import { sendTemplateMessage } from "@/lib/channels/whatsapp-api";
import { HANDLER_REMINDER_MINUTES } from "@/lib/prevent/timers";
import { recordWhatsAppReplyRoute } from "@/lib/notifications/whatsapp-reply-routing";

// Founder request 2026-09-14: a customer replying to a conversation a human
// account handler already owns (state = 'human_handling') must never be
// silently handed back to the AI — see process.ts's isHumanActive branch and
// timers.ts's computeConversationsNeedingReminder. This is the notification
// half of that decision: unlike sendEscalationNotification/
// sendEscalationWhatsApp (escalation-email.ts / escalation-whatsapp.ts),
// which broadcast to the business's whole team in role-priority order, this
// targets exactly one person — the handler already assigned to the
// conversation (conversations.assigned_to, the email markTakeConversation
// stored) — since the whole point is this is already their customer, not a
// fresh alert that needs triage.
const FROM_ADDRESS = "Capture Alerts <escalations@mail.capture.com.ng>";

// Reuses the same Meta-approved `escalation_alert` template as
// escalation-whatsapp.ts rather than submitting a second one for review —
// its four params (who, channel, snippet, link) already say "a conversation
// needs you," which reads correctly for both a fresh reply and a reminder;
// only the email copy below actually differs by `kind`.
// Founder request 2026-09-15: same reformatting as escalation-whatsapp.ts's
// own note — escalation_alert_v2 replaces escalation_alert with line
// breaks between fields, approved by Meta the same day.
const TEMPLATE_NAME = "escalation_alert_v2";
const TEMPLATE_LANGUAGE = "en_US";
const MAX_MESSAGE_SNIPPET_LENGTH = 150;

// Founder request 2026-09-15: sent from Capture's OWN connected WhatsApp
// number, not the escalating business's — see escalation-whatsapp.ts's own
// note on this, same reasoning and same env var applies here.
const NOTIFICATION_BUSINESS_ID = process.env.WHATSAPP_NOTIFICATION_BUSINESS_ID;

const CHANNEL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  other: "Other",
};

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export type HandlerNotification = {
  businessId: string;
  // Added 2026-09-14 (DEV-48): lets the WhatsApp leg record a
  // whatsapp_reply_routes row, so the handler's swipe-reply to this exact
  // alert routes back to this conversation instead of becoming a new,
  // unrelated inbound message.
  conversationId: string;
  // conversations.assigned_to — an email address (see markTakeConversation
  // in components/engage/actions.ts), not a business_members row id.
  assignedTo: string;
  customerName: string | null;
  channel: string;
  messageBody: string;
  conversationUrl: string;
  kind: "reply" | "reminder";
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Deliberately never throws — same discipline as sendEscalationNotification:
// the real guarantee (AI stays suppressed, conversation stays assigned) is
// already true by the time this runs; this is a courtesy on top of it.
async function notifyHandlerEmail(n: HandlerNotification): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.error("Handler notification skipped: RESEND_API_KEY is not set");
    return;
  }

  try {
    const who = n.customerName ?? "A customer";
    const escapedMessage = escapeHtml(n.messageBody);
    const subject = n.kind === "reply" ? `${who} just replied — you're up` : `Still waiting on your reply to ${who}`;
    const lede =
      n.kind === "reply"
        ? `<strong>${who}</strong> just replied on ${CHANNEL_LABEL[n.channel] ?? n.channel}. Engage is staying off this conversation since you're already handling it.`
        : `<strong>${who}</strong> messaged ${HANDLER_REMINDER_MINUTES} minutes ago and hasn't heard back yet. Engage is still staying off this conversation until you reply.`;

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [n.assignedTo],
      subject,
      html: `
        <p>${lede}</p>
        <blockquote style="margin:0 0 1em;padding-left:12px;border-left:3px solid #ccc;color:#333;">${escapedMessage}</blockquote>
        <p><a href="${n.conversationUrl}">Open the conversation →</a></p>
      `,
    });
    if (error) {
      console.error("Handler notification failed to send", { businessId: n.businessId, error });
    }
  } catch (err) {
    console.error("Handler notification threw unexpectedly", { businessId: n.businessId, err });
  }
}

// Resolves the assigned handler's own WhatsApp notification number — unlike
// escalation-whatsapp.ts's getBusinessRecipientPhones (which returns the
// whole role-priority-ordered team), this needs exactly one person's
// number, matched by email since that's the only identity
// conversations.assigned_to carries. business_members has no email column
// (auth.users does), so — same as escalation-email.ts's own recipient
// resolution — this goes through the Admin Auth API per member, not a
// direct query.
async function findAssignedHandlerWhatsAppNumber(businessId: string, assignedTo: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data: members } = await supabase
    .from("business_members")
    .select("user_id, whatsapp_number")
    .eq("business_id", businessId)
    .not("whatsapp_number", "is", null);
  if (!members || members.length === 0) return null;

  for (const member of members) {
    const { data } = await supabase.auth.admin.getUserById(member.user_id);
    if (data.user?.email === assignedTo) return member.whatsapp_number as string;
  }
  return null;
}

export async function notifyHandlerWhatsApp(n: HandlerNotification): Promise<void> {
  try {
    if (!NOTIFICATION_BUSINESS_ID) {
      console.error("Handler WhatsApp notification skipped: WHATSAPP_NOTIFICATION_BUSINESS_ID is not set");
      return;
    }
    const supabase = createServiceRoleClient();
    const { data: connection } = await supabase
      .from("channel_connections")
      .select("access_token_encrypted, external_account_id")
      .eq("business_id", NOTIFICATION_BUSINESS_ID)
      .eq("channel", "whatsapp")
      .is("disconnected_at", null)
      .maybeSingle();
    if (!connection) return; // Capture's own platform WhatsApp number isn't connected — email still goes out regardless

    const phone = await findAssignedHandlerWhatsAppNumber(n.businessId, n.assignedTo);
    if (!phone) return; // the assigned handler hasn't set a notification number

    const accessToken = decryptToken(connection.access_token_encrypted);
    const snippet = n.messageBody.length > MAX_MESSAGE_SNIPPET_LENGTH ? n.messageBody.slice(0, MAX_MESSAGE_SNIPPET_LENGTH - 1) + "…" : n.messageBody;
    const params = [n.customerName ?? "A customer", CHANNEL_LABEL[n.channel] ?? n.channel, snippet, n.conversationUrl];

    const whatsappMessageId = await sendTemplateMessage(accessToken, connection.external_account_id, phone, TEMPLATE_NAME, TEMPLATE_LANGUAGE, params);
    if (whatsappMessageId) {
      await recordWhatsAppReplyRoute({ businessId: n.businessId, conversationId: n.conversationId, whatsappMessageId, recipientWaId: phone });
    }
  } catch (err) {
    console.error("Handler WhatsApp notification threw unexpectedly", { businessId: n.businessId, err });
  }
}

export async function notifyHandler(n: HandlerNotification): Promise<void> {
  await Promise.all([notifyHandlerEmail(n), notifyHandlerWhatsApp(n)]);
}

import "server-only";
import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Founder request 2026-08-21: nobody gets pinged when a conversation
// escalates today — a human has to be looking at the dashboard to notice
// (PLANS.md 5.4, already logged as a known gap). WhatsApp was the
// originally-planned notification channel (PRD §19–20) but is still fully
// blocked on DEP-1/DEP-2 (no WhatsApp Business API access). Email via
// Resend is what's actually available right now — `mail.capture.com.ng`
// is already verified there (founder-confirmed 2026-08-21), so this needs
// only an API key, no domain-verification wait.
const FROM_ADDRESS = "Capture Alerts <escalations@mail.capture.com.ng>";

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

// Founder decision 2026-08-25: escalation notifications are now scoped by
// plan tier to a number of *recipients*, not a monthly count of *events* —
// every escalation always notifies (nothing ever goes silent because a
// monthly quota ran out), but only the top `recipientLimit` team members
// hear about it, in role-priority order (owner, then admin, then staff;
// ties broken by who joined first). `recipientLimit: null` means
// unlimited — every member gets notified (no plan, or trial/unbilled).
const ROLE_PRIORITY: Record<string, number> = { owner: 0, admin: 1, staff: 2 };

// auth.users isn't queryable through the normal client — this is the
// sanctioned way to resolve a member's email from the service role,
// per Supabase's own Admin Auth API (not reaching into the auth schema
// directly).
async function getBusinessRecipientEmails(businessId: string, recipientLimit: number | null): Promise<string[]> {
  const supabase = createServiceRoleClient();
  const { data: members } = await supabase
    .from("business_members")
    .select("user_id, role, created_at")
    .eq("business_id", businessId);
  if (!members || members.length === 0) return [];

  const ordered = [...members].sort((a, b) => {
    const roleDiff = (ROLE_PRIORITY[a.role] ?? 99) - (ROLE_PRIORITY[b.role] ?? 99);
    if (roleDiff !== 0) return roleDiff;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  const selected = recipientLimit != null ? ordered.slice(0, recipientLimit) : ordered;

  const emails = await Promise.all(
    selected.map(async (m) => {
      const { data } = await supabase.auth.admin.getUserById(m.user_id);
      return data.user?.email ?? null;
    }),
  );
  return emails.filter((e): e is string => !!e);
}

export type EscalationNotification = {
  businessId: string;
  businessName: string;
  customerName: string | null;
  escalationReason: string;
  // Founder-caught 2026-09-08: the email never carried what the customer
  // actually said — a human had to click through to the dashboard just to
  // see what needed attention. `messageBody` is the exact text that
  // triggered this escalation (already in scope at the one call site,
  // process.ts's `processConversationMessage`), shown verbatim so the
  // email is actionable on its own.
  messageBody: string;
  conversationUrl: string;
  // Plan's escalation_notification_limit — how many team members (in role
  // priority order) get this email. null = every member.
  recipientLimit: number | null;
};

// Deliberately never throws — a notification failing to send must never
// break the actual escalation it's about (the conversation is already
// correctly marked human_required by the time this runs; that's the real
// safety guarantee, this is a courtesy on top of it). Logs loudly instead,
// same "fail loud, not silent" discipline as the rest of this codebase's
// external-API call sites.
export async function sendEscalationNotification(notification: EscalationNotification): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.error("Escalation notification skipped: RESEND_API_KEY is not set");
    return;
  }

  try {
    const recipients = await getBusinessRecipientEmails(notification.businessId, notification.recipientLimit);
    if (recipients.length === 0) {
      console.error(`Escalation notification skipped: no members found for business ${notification.businessId}`);
      return;
    }

    const who = notification.customerName ?? "A customer";
    // Escaped, not interpolated raw into the template — messageBody is
    // customer-supplied text landing directly in an HTML email body.
    const escapedMessage = notification.messageBody.replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
    );
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: recipients,
      subject: `${notification.businessName}: a conversation needs you`,
      html: `
        <p><strong>${who}</strong> asked something Engage couldn't safely answer on its own.</p>
        <blockquote style="margin:0 0 1em;padding-left:12px;border-left:3px solid #ccc;color:#333;">${escapedMessage}</blockquote>
        <p><strong>Reason:</strong> ${notification.escalationReason}</p>
        <p><a href="${notification.conversationUrl}">Open the conversation →</a></p>
      `,
    });
    if (error) {
      console.error("Escalation notification failed to send", { businessId: notification.businessId, error });
    }
  } catch (err) {
    console.error("Escalation notification threw unexpectedly", { businessId: notification.businessId, err });
  }
}

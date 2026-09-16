import "server-only";
import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Founder request 2026-09-16: a business's Instagram account can be
// connected or disconnected (via the dashboard button, an OAuth
// reconnect, or Meta revoking access) with nobody on the team notified —
// silent either way. Reuses the same Resend setup as escalation-email.ts
// (mail.capture.com.ng, already verified there).
const FROM_ADDRESS = "Capture Alerts <escalations@mail.capture.com.ng>";

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

const CHANNEL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  other: "Other",
};

// Deliberately every team member, not the plan-tier-limited recipient list
// escalation-email.ts's getBusinessRecipientEmails uses — a channel
// connecting or disconnecting changes what the whole team can see and
// respond to, not just who's on point for one conversation, and it's
// exactly the kind of event (could mean Meta revoked access, or someone
// disconnected it by mistake) everyone should hear about regardless of
// plan tier.
async function getAllBusinessMemberEmails(businessId: string): Promise<string[]> {
  const supabase = createServiceRoleClient();
  const { data: members } = await supabase.from("business_members").select("user_id").eq("business_id", businessId);
  if (!members || members.length === 0) return [];

  const emails = await Promise.all(
    members.map(async (m) => {
      const { data } = await supabase.auth.admin.getUserById(m.user_id);
      return data.user?.email ?? null;
    }),
  );
  return emails.filter((e): e is string => !!e);
}

export type ChannelConnectionEvent = {
  businessId: string;
  channel: "instagram";
  action: "connected" | "disconnected";
  // The connected account's handle, when known — disconnectInstagram()
  // reads it back from the row being closed out before the notification
  // fires, since the update itself doesn't return it.
  username: string | null;
};

// Deliberately never throws, same discipline as sendEscalationNotification
// and notifyHandler — the real guarantee (the connection row is already
// correctly updated by the time this runs) doesn't depend on this
// courtesy notification succeeding.
export async function notifyChannelConnectionChange(event: ChannelConnectionEvent): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.error("Channel connection notification skipped: RESEND_API_KEY is not set");
    return;
  }

  try {
    const recipients = await getAllBusinessMemberEmails(event.businessId);
    if (recipients.length === 0) {
      console.error(`Channel connection notification skipped: no members found for business ${event.businessId}`);
      return;
    }

    const channelLabel = CHANNEL_LABEL[event.channel] ?? event.channel;
    const handle = event.username ? ` (@${event.username})` : "";
    const isConnect = event.action === "connected";
    const subject = isConnect ? `${channelLabel} connected to Capture` : `${channelLabel} disconnected from Capture`;
    const lede = isConnect
      ? `Your ${channelLabel} account${handle} is now connected to Capture. Engage can read and reply to messages from it.`
      : `Your ${channelLabel} account${handle} has been disconnected from Capture. Engage will no longer see or reply to messages from it until it's reconnected.`;
    const followUp = isConnect ? "" : `<p>Didn't do this? Reconnect it from your dashboard, or reply to this email and we'll help.</p>`;

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: recipients,
      subject,
      html: `<p>${lede}</p>${followUp}`,
    });
    if (error) {
      console.error("Channel connection notification failed to send", { businessId: event.businessId, error });
    }
  } catch (err) {
    console.error("Channel connection notification threw unexpectedly", { businessId: event.businessId, err });
  }
}

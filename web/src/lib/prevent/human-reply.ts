import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { decryptToken } from "@/lib/channels/token-crypto";
import { sendMessage as sendInstagramMessage } from "@/lib/channels/instagram-api";
import { sendMessage as sendWhatsAppMessage } from "@/lib/channels/whatsapp-api";
import { sendMessage as sendFacebookMessage } from "@/lib/channels/facebook-api";

export type HumanReplyResult = { ok: boolean; message: string };

// Instagram's own documented Send API limit (1000) — kept as the shared
// cap for WhatsApp too even though its session-message limit is higher
// (4096): a human-typed reply in this box realistically never approaches
// either, so there's no reason to carry two different limits for one
// textarea.
const MAX_REPLY_LENGTH = 1000;

// The first real "reply to the customer" path in the app — before this,
// "Take Conversation" only stopped the AI; a human had to message the
// customer outside Capture entirely. Deliberately dispatched by
// `conversations.channel` rather than hardcoded to Instagram — the
// WhatsApp branch below (added 2026-09-08, DEV-35) is exactly the shape
// predicted here originally: look up its channel_connections row, send,
// log a `business` message, no restructuring needed.
//
// Caller must have already verified the current session owns businessId
// (same discipline documented in lib/channels/instagram.ts) — this uses
// the service role to read the encrypted access token, which bypasses
// RLS entirely.
export async function sendHumanReply(
  businessId: string,
  conversationId: string,
  text: string,
  // Added 2026-09-14 (DEV-48): set only by the WhatsApp webhook's
  // cross-channel reply routing, to the inbound Meta message id that
  // triggered this reply. Stored on the logged message so a redelivered
  // webhook event (Meta's delivery is at-least-once) is caught by the exact
  // same external_message_id idempotency check the webhook already runs
  // before ever reaching this function — without it, a retry would
  // re-trigger a second real send to the customer. Every other caller
  // (the dashboard's own reply box) has no such id and omits this.
  externalMessageId?: string,
): Promise<HumanReplyResult> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, message: "Message can't be empty." };
  if (trimmed.length > MAX_REPLY_LENGTH) {
    return { ok: false, message: `Message must be under ${MAX_REPLY_LENGTH} characters.` };
  }

  const supabase = createServiceRoleClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, channel, customer_id")
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!conversation) return { ok: false, message: "Conversation not found." };

  const { data: customer } = await supabase
    .from("customers")
    .select("external_customer_id")
    .eq("id", conversation.customer_id)
    .maybeSingle();
  if (!customer?.external_customer_id) {
    return { ok: false, message: "This customer has no linked external account — can't send a reply." };
  }

  if (conversation.channel === "instagram") {
    const { data: connection } = await supabase
      .from("channel_connections")
      .select("access_token_encrypted, external_account_id")
      .eq("business_id", businessId)
      .eq("channel", "instagram")
      .is("disconnected_at", null)
      .maybeSingle();
    if (!connection) return { ok: false, message: "Instagram isn't connected for this business." };

    try {
      await sendInstagramMessage(
        decryptToken(connection.access_token_encrypted),
        connection.external_account_id,
        customer.external_customer_id,
        trimmed,
      );
    } catch (err) {
      console.error("Human reply send failed", { businessId, conversationId, err });
      return {
        ok: false,
        message:
          "Couldn't send — Instagram rejected the message. This usually means the 24-hour reply window since the customer's last message has closed.",
      };
    }
  } else if (conversation.channel === "whatsapp") {
    // Live as of 2026-09-08 (DEV-35) — this branch was the exact one
    // predicted in this function's own top-of-file comment before
    // WhatsApp ingestion existed.
    const { data: connection } = await supabase
      .from("channel_connections")
      .select("access_token_encrypted, external_account_id")
      .eq("business_id", businessId)
      .eq("channel", "whatsapp")
      .is("disconnected_at", null)
      .maybeSingle();
    if (!connection) return { ok: false, message: "WhatsApp isn't connected for this business." };

    try {
      await sendWhatsAppMessage(
        decryptToken(connection.access_token_encrypted),
        connection.external_account_id,
        customer.external_customer_id,
        trimmed,
      );
    } catch (err) {
      console.error("Human reply send failed", { businessId, conversationId, err });
      return {
        ok: false,
        message:
          "Couldn't send — WhatsApp rejected the message. This usually means the 24-hour reply window since the customer's last message has closed.",
      };
    }
  } else if (conversation.channel === "facebook") {
    const { data: connection } = await supabase
      .from("channel_connections")
      .select("access_token_encrypted, external_account_id")
      .eq("business_id", businessId)
      .eq("channel", "facebook")
      .is("disconnected_at", null)
      .maybeSingle();
    if (!connection) return { ok: false, message: "Facebook isn't connected for this business." };

    try {
      await sendFacebookMessage(
        decryptToken(connection.access_token_encrypted),
        connection.external_account_id,
        customer.external_customer_id,
        trimmed,
      );
    } catch (err) {
      console.error("Human reply send failed", { businessId, conversationId, err });
      return {
        ok: false,
        message:
          "Couldn't send — Facebook rejected the message. This usually means the 24-hour reply window since the customer's last message has closed.",
      };
    }
  } else {
    return { ok: false, message: `Replying isn't supported for this conversation's channel yet.` };
  }

  const sentAt = new Date().toISOString();
  await supabase.from("messages").insert({
    business_id: businessId,
    conversation_id: conversationId,
    sender_type: "business",
    body: trimmed,
    external_message_id: externalMessageId ?? null,
    sent_at: sentAt,
  });
  await supabase.from("conversations").update({ last_message_at: sentAt }).eq("id", conversationId);

  return { ok: true, message: "Sent." };
}

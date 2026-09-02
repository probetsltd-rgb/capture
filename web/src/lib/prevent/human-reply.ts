import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { decryptToken } from "@/lib/channels/token-crypto";
import { sendMessage } from "@/lib/channels/instagram-api";

export type HumanReplyResult = { ok: boolean; message: string };

const MAX_REPLY_LENGTH = 1000; // Instagram's own documented Send API limit

// The first real "reply to the customer" path in the app — before this,
// "Take Conversation" only stopped the AI; a human had to message the
// customer outside Capture entirely. Deliberately dispatched by
// `conversations.channel` rather than hardcoded to Instagram, even though
// Instagram is the only live channel today: once WhatsApp ingestion is
// live, a WhatsApp-sourced conversation's reply needs the same shape
// (look up its channel_connections row, send, log a `business` message),
// and this function shouldn't need restructuring to gain that branch —
// see OUTSTANDINGS.md's WhatsApp-relay-escalation note for the fuller
// design.
//
// Caller must have already verified the current session owns businessId
// (same discipline documented in lib/channels/instagram.ts) — this uses
// the service role to read the encrypted access token, which bypasses
// RLS entirely.
export async function sendHumanReply(
  businessId: string,
  conversationId: string,
  text: string,
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
      await sendMessage(
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
    return { ok: false, message: "WhatsApp replies aren't live yet." };
  } else {
    return { ok: false, message: `Replying isn't supported for this conversation's channel yet.` };
  }

  const sentAt = new Date().toISOString();
  await supabase.from("messages").insert({
    business_id: businessId,
    conversation_id: conversationId,
    sender_type: "business",
    body: trimmed,
    sent_at: sentAt,
  });
  await supabase.from("conversations").update({ last_message_at: sentAt }).eq("id", conversationId);

  return { ok: true, message: "Sent." };
}

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Founder request 2026-09-14 (DEV-48): closes a real gap surfaced by a live
// test — a WhatsApp escalation/handler-notification alert is a one-way
// message today, so a team member swipe-replying to it (WhatsApp's native
// quoted-reply gesture) had nowhere to go: Capture's webhook had no way to
// know that reply was "about" another conversation, so it created a brand
// new customer/conversation from the recipient's own phone number and ran
// it through the normal AI pipeline — the founder's own real reply got
// treated as a customer message and answered by the AI.
//
// This module is deliberately thin and import-light (only the service-role
// client) — `recordWhatsAppReplyRoute` is called from escalation-whatsapp.ts
// and handler-notification.ts (both already imported by process.ts), and
// `resolveWhatsAppReplyRoute`/`resolveHandlerEmailByWhatsAppNumber` are
// called from the WhatsApp webhook route (which itself already imports
// process.ts's takeConversation and human-reply.ts's sendHumanReply to
// actually do the routing). Importing either of those *from here* would
// create process.ts -> escalation-whatsapp.ts -> this module -> process.ts,
// a real import cycle — so the webhook route orchestrates, this module only
// resolves.

// Meta's inbound webhook payload gives `context.from`/`message.from` as
// digits only, no "+" (confirmed against real production data: a founder
// test reply's `external_customer_id` landed as "2348000000001", no plus).
// business_members.whatsapp_number is saved WITH a leading "+" (confirmed
// against the same real data — DEV-47's live send used it as-is and
// succeeded). Both sides get normalized to this same digits-only shape
// before comparing, so the format mismatch never causes a false negative.
export function normalizeWaId(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

export async function recordWhatsAppReplyRoute(params: {
  businessId: string;
  conversationId: string;
  whatsappMessageId: string;
  recipientWaId: string;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("whatsapp_reply_routes").insert({
    business_id: params.businessId,
    conversation_id: params.conversationId,
    whatsapp_message_id: params.whatsappMessageId,
    recipient_wa_id: normalizeWaId(params.recipientWaId),
  });
  // Never blocks the notification send this is attached to — a routing row
  // failing to save just means a later swipe-reply falls through to the
  // normal (pre-DEV-48) inbound-message handling instead of routing
  // correctly, not that the notification itself failed to send.
  if (error) {
    console.error("Failed to record WhatsApp reply route", { businessId: params.businessId, error });
  }
}

export type ResolvedReplyRoute = { businessId: string; conversationId: string };

// `contextMessageId` is `messages[].context.id` from the inbound webhook
// payload — present only when the sender used WhatsApp's native swipe/quote
// reply on a specific earlier message; absent for an ordinary typed
// message, which correctly falls through to normal inbound handling (there
// is no way to correlate that case, by design of the underlying mechanism).
//
// Founder request 2026-09-15: no longer takes a `businessId` to filter by —
// since escalation/handler notifications now all send from Capture's own
// shared WhatsApp number (WHATSAPP_NOTIFICATION_BUSINESS_ID, see
// escalation-whatsapp.ts/handler-notification.ts), a swipe-reply to one
// always arrives on THAT number regardless of which business it's actually
// about, so `getConnectionByPhoneNumberId`'s resolved business in the
// webhook route is no longer the right business to filter or act on. The
// real business is instead read directly off the matched route row (it was
// recorded correctly at send time, from the real escalating business) and
// returned to the caller — resolving identity from the route, never from
// which number the reply happened to land on.
//
// The recipient match below is load-bearing, not a tidiness check: without
// it, anyone who somehow obtained a real wamid (e.g. a notification
// forwarded or screenshotted with its raw id, however unlikely) could
// spoof a reply into another business's conversation. Requiring the
// inbound sender to be the exact phone number that specific notification
// was sent to means a match only succeeds for someone who could plausibly
// have received the real WhatsApp message and swiped to reply on it.
export async function resolveWhatsAppReplyRoute(
  contextMessageId: string | undefined,
  fromWaId: string,
): Promise<ResolvedReplyRoute | null> {
  if (!contextMessageId) return null;

  const supabase = createServiceRoleClient();
  const { data: route } = await supabase
    .from("whatsapp_reply_routes")
    .select("business_id, conversation_id, recipient_wa_id")
    .eq("whatsapp_message_id", contextMessageId)
    .maybeSingle();
  if (!route || route.recipient_wa_id !== normalizeWaId(fromWaId)) return null;

  return { businessId: route.business_id, conversationId: route.conversation_id };
}

// Reverse of handler-notification.ts's own lookup (which goes email ->
// whatsapp_number to find where to send) — this goes whatsapp_number ->
// email, needed so a routed reply can be attributed to (and the
// conversation taken by) the actual person who replied, not left
// unassigned. Same Admin Auth API pattern as escalation-email.ts's
// getBusinessRecipientEmails: business_members has no email column.
export async function resolveHandlerEmailByWhatsAppNumber(businessId: string, fromWaId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data: members } = await supabase
    .from("business_members")
    .select("user_id, whatsapp_number")
    .eq("business_id", businessId)
    .not("whatsapp_number", "is", null);
  if (!members || members.length === 0) return null;

  const normalizedFrom = normalizeWaId(fromWaId);
  const match = members.find((m) => normalizeWaId(m.whatsapp_number as string) === normalizedFrom);
  if (!match) return null;

  const { data } = await supabase.auth.admin.getUserById(match.user_id);
  return data.user?.email ?? null;
}

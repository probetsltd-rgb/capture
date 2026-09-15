import { after, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getConnectionByPhoneNumberId, findOrCreateConversationForInboundMessage } from "@/lib/channels/whatsapp";
import { sendMessage, sendMediaMessage, inferMediaType } from "@/lib/channels/whatsapp-api";
import { handleInboundMessage, takeConversation } from "@/lib/prevent/process";
import { sendHumanReply } from "@/lib/prevent/human-reply";
import { resolveWhatsAppReplyRoute, resolveHandlerEmailByWhatsAppNumber } from "@/lib/notifications/whatsapp-reply-routing";

// WhatsApp Cloud API webhook receiver. Deliberately its own route, not a
// branch inside the Instagram one — the payload shape is genuinely
// different (entry[].changes[].value.messages[], not entry[].messaging[]),
// confirmed against Meta's current WhatsApp Cloud API docs during this
// build rather than assumed to match Instagram just because both are Meta
// endpoints (that exact assumption is what cost real time on the
// Instagram build's own token-exchange saga — see instagram-api.ts).
// GET verify handshake and POST signature verification otherwise mirror
// the Instagram webhook route exactly (same hub.challenge scheme, same
// x-hub-signature-256 HMAC).

type WhatsAppContact = { profile?: { name?: string }; wa_id: string };
type WhatsAppMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  // Present only when the sender used WhatsApp's native "swipe to reply"
  // quote gesture on a specific earlier message — DEV-48's cross-channel
  // reply routing keys off `context.id` to recognize a reply to a
  // notification Capture itself sent. Confirmed against Meta's current
  // WhatsApp Cloud API docs during this build, not assumed.
  context?: { from: string; id: string };
};
type WhatsAppValue = {
  metadata: { phone_number_id: string; display_phone_number?: string };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
};
type WebhookPayload = {
  object: string;
  entry: { id: string; changes: { field: string; value: WhatsAppValue }[] }[];
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    return new Response("Server not configured", { status: 500 });
  }

  if (mode === "subscribe" && challenge && token === verifyToken) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret || !signature) {
    return new Response("Unauthorized", { status: 401 });
  }

  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  const validSignature =
    signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  if (!validSignature) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("WhatsApp webhook: body was not valid JSON", rawBody.slice(0, 500));
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  // Ack fast, process after — same discipline as the Instagram webhook,
  // same reason (Meta retries on timeout/non-200; the idempotency check
  // inside makes a redelivery safe, but there's no reason to invite one by
  // running everything synchronously first).
  after(() => processEvents(payload).catch((err) => console.error("WhatsApp webhook processing failed", err)));

  return new Response("EVENT_RECEIVED", { status: 200 });
}

async function processEvents(payload: WebhookPayload): Promise<void> {
  if (payload.object !== "whatsapp_business_account") return;

  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      // `field` is also "statuses" for delivery/read receipts on messages
      // Capture itself sent — real events, not errors, but out of scope
      // here (no read-receipt UI exists to feed) and must never be
      // mistaken for an inbound customer message.
      if (change.field !== "messages") continue;

      for (const message of change.value.messages ?? []) {
        try {
          await processOneMessage(change.value, message);
        } catch (err) {
          console.error("WhatsApp inbound message processing failed", err);
        }
      }
    }
  }
}

async function processOneMessage(value: WhatsAppValue, message: WhatsAppMessage): Promise<void> {
  if (message.type !== "text" || !message.text?.body) {
    console.log("WhatsApp webhook: skipping non-text message", message.id, message.type);
    return; // media/location/etc. — not handled yet, same gap Instagram has for non-text
  }

  const phoneNumberId = value.metadata.phone_number_id;
  const connection = await getConnectionByPhoneNumberId(phoneNumberId);
  if (!connection) {
    console.error(`WhatsApp webhook: no active connection for phone_number_id ${phoneNumberId}`);
    return;
  }

  const supabase = createServiceRoleClient();

  // Meta's webhook delivery is at-least-once — a redelivered event must
  // not trigger a second AI reply (or, on the routed-reply path below, a
  // second real send to a customer). Global, not scoped to
  // connection.businessId: a routed reply gets stored under the real
  // escalating business's id (resolved from the route itself, per the
  // note below), which since 2026-09-15 is no longer necessarily the same
  // business that owns the number this event arrived on — external_message_id
  // is a Meta-generated wamid, globally unique, so scoping this check by
  // business was never actually necessary, just previously harmless.
  const { data: alreadyProcessed } = await supabase.from("messages").select("id").eq("external_message_id", message.id).maybeSingle();
  if (alreadyProcessed) return;

  // DEV-48: a swipe-reply to a Capture-sent escalation/handler-notification
  // alert routes back to the ORIGINAL conversation as the replying team
  // member's real answer, instead of being treated as an ordinary new
  // inbound message from an unrecognized number (the real bug this closes
  // — see whatsapp-reply-routing.ts's own top-of-file note for the incident
  // that surfaced it). Checked before findOrCreateConversationForInboundMessage
  // so a routed reply never creates a stray customer/conversation at all.
  //
  // Since 2026-09-15, escalation/handler notifications all send from
  // Capture's own shared WhatsApp number — a swipe-reply to one arrives on
  // THAT number regardless of which business it's actually about, so
  // `connection.businessId` (whoever owns the number this event arrived on)
  // is no longer the right business for a routed reply. `resolveWhatsAppReplyRoute`
  // resolves the real business directly from the route row instead — use
  // `route.businessId` for everything below, never `connection.businessId`,
  // within this branch.
  const route = await resolveWhatsAppReplyRoute(message.context?.id, message.from);
  if (route) {
    const assignedTo = await resolveHandlerEmailByWhatsAppNumber(route.businessId, message.from);
    if (assignedTo) {
      // A team member replying is, in effect, taking the conversation —
      // matches what clicking "Take Conversation" in the dashboard does, so
      // the AI stays suppressed on it going forward and the dashboard shows
      // who's handling it, exactly as if they'd used the UI.
      await takeConversation(supabase, route.conversationId, assignedTo);
    } else {
      console.error("WhatsApp reply route matched but sender's number isn't on any business_members row", {
        businessId: route.businessId,
        conversationId: route.conversationId,
      });
    }
    await sendHumanReply(route.businessId, route.conversationId, message.text.body, message.id);
    return;
  }

  const contact = value.contacts?.find((c) => c.wa_id === message.from);
  const { conversationId } = await findOrCreateConversationForInboundMessage(
    connection.businessId,
    message.from,
    contact?.profile?.name ?? null,
  );

  const result = await handleInboundMessage(
    supabase,
    connection.businessId,
    conversationId,
    message.text.body,
    message.id,
  );

  if (result.status === "responded") {
    await sendMessage(connection.accessToken, phoneNumberId, message.from, result.response);
    if (result.mediaUrl) {
      await sendMediaMessage(connection.accessToken, phoneNumberId, message.from, result.mediaUrl, inferMediaType(result.mediaUrl));
    }
  }
}

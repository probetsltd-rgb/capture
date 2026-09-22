import { after, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getConnectionByPageId, findOrCreateConversationForInboundMessage } from "@/lib/channels/facebook";
import { sendMessage, sendMediaMessage, inferMediaType } from "@/lib/channels/facebook-api";
import { handleInboundMessage } from "@/lib/prevent/process";

// Facebook Page Messenger webhook receiver (OUTSTANDINGS.md "Channel
// roadmap confirmed 2026-09-08"). object: "page", entry[].messaging[] —
// verified against Meta's current Messenger Platform docs during this
// build, and closer in shape to Instagram's webhook than to WhatsApp's
// (entry[].changes[].value.messages[]) despite all three being Meta
// endpoints — confirmed rather than assumed, same discipline as every
// other channel here. GET verify handshake and POST signature verification
// mirror the Instagram/WhatsApp webhook routes exactly (same hub.challenge
// scheme, same x-hub-signature-256 HMAC).

type MessagingEvent = {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: { mid: string; text?: string; is_echo?: boolean };
};

type WebhookPayload = {
  object: string;
  entry: { id: string; time: number; messaging?: MessagingEvent[] }[];
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
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
  const appSecret = process.env.FACEBOOK_APP_SECRET;

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
    console.error("Facebook webhook: body was not valid JSON", rawBody.slice(0, 500));
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  // Ack fast, process after — Meta retries on timeout/non-200; the
  // idempotency check inside processOneMessage makes a redelivery safe.
  after(() => processEvents(payload).catch((err) => console.error("Facebook webhook processing failed", err)));

  return new Response("EVENT_RECEIVED", { status: 200 });
}

async function processEvents(payload: WebhookPayload): Promise<void> {
  if (payload.object !== "page") return;

  for (const entry of payload.entry) {
    for (const event of entry.messaging ?? []) {
      try {
        await processOneMessage(entry.id, event);
      } catch (err) {
        console.error("Facebook inbound message processing failed", err);
      }
    }
  }
}

async function processOneMessage(pageId: string, event: MessagingEvent): Promise<void> {
  const message = event.message;
  if (!message) {
    console.log("Facebook webhook: skipping non-message event", JSON.stringify(event));
    return; // postback or other non-message event — out of scope for now
  }
  if (message.is_echo) {
    console.log("Facebook webhook: skipping echo of our own outbound message", message.mid);
    return;
  }
  if (!message.text) {
    console.log("Facebook webhook: skipping message with no text (media/attachment)", message.mid);
    return; // media/attachment-only — not handled yet, same gap Instagram has
  }

  const connection = await getConnectionByPageId(pageId);
  if (!connection) {
    console.error(`Facebook webhook: no active connection for page ${pageId}`);
    return;
  }

  const supabase = createServiceRoleClient();

  // Meta's webhook delivery is at-least-once, not exactly-once — a
  // redelivered event must not trigger a second AI reply to the customer.
  const { data: alreadyProcessed } = await supabase
    .from("messages")
    .select("id")
    .eq("business_id", connection.businessId)
    .eq("external_message_id", message.mid)
    .maybeSingle();
  if (alreadyProcessed) return;

  const { conversationId } = await findOrCreateConversationForInboundMessage(connection.businessId, event.sender.id);

  const result = await handleInboundMessage(
    supabase,
    connection.businessId,
    conversationId,
    message.text,
    message.mid,
  );

  if (result.status === "responded") {
    await sendMessage(connection.accessToken, pageId, event.sender.id, result.response);
    if (result.mediaUrl) {
      await sendMediaMessage(connection.accessToken, pageId, event.sender.id, result.mediaUrl, inferMediaType(result.mediaUrl));
    }
  }
}

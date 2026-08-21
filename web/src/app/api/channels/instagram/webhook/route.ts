import { after, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getConnectionByExternalAccountId, findOrCreateConversationForInboundMessage } from "@/lib/channels/instagram";
import { sendMessage, sendMediaMessage, inferMediaType } from "@/lib/channels/instagram-api";
import { handleInboundMessage } from "@/lib/prevent/process";

// Instagram webhook receiver (PLANS.md Phase 5.2, Capture_PRD_Addendum_v2.md
// §15). GET is Meta's required verification handshake — Meta calls this with
// hub.mode/hub.verify_token/hub.challenge when the webhook is configured or
// re-verified, and expects hub.challenge echoed back verbatim only if the
// token matches. POST verifies the request signature (Cross-Cutting Security
// Workstream item) then routes real inbound messages through the same
// handleInboundMessage() the simulate-inbound harness already exercises,
// and — unlike the harness — actually sends the AI's reply back to the
// real customer via sendMessage(). This is the piece that makes Engage
// real-time rather than just a historical audit; see TESTS.md for the
// verification plan (deliberately not tested against a random real
// customer — see that log for how this was verified safely instead).

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

  const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
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
  const appSecret = process.env.INSTAGRAM_APP_SECRET;

  if (!appSecret || !signature) {
    return new Response("Unauthorized", { status: 401 });
  }

  const expected =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  const validSignature =
    signatureBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

  if (!validSignature) {
    return new Response("Invalid signature", { status: 401 });
  }

  // Meta requires a fast ack and retries on timeout/non-200 — acknowledge
  // immediately, process after. A failure inside processEvents() must
  // never surface as a non-200 here, or Meta will redeliver the same
  // event(s) indefinitely; the idempotency check inside already makes
  // redelivery safe, but there's no reason to invite it.
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("Instagram webhook: body was not valid JSON", rawBody.slice(0, 500));
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  // Temporary diagnostic (2026-08-15): a real test message produced zero
  // errors and zero DB writes, meaning some guard in processOneMessage is
  // silently no-op'ing on a real event without ever explaining why. Every
  // prior mystery this session got solved by logging real payloads instead
  // of guessing at their shape — same approach here.
  console.log("Instagram webhook payload received:", JSON.stringify(payload));

  after(() => processEvents(payload).catch((err) => console.error("Instagram webhook processing failed", err)));

  return new Response("EVENT_RECEIVED", { status: 200 });
}

async function processEvents(payload: WebhookPayload): Promise<void> {
  if (payload.object !== "instagram") return;

  for (const entry of payload.entry) {
    for (const event of entry.messaging ?? []) {
      try {
        await processOneMessage(entry.id, event);
      } catch (err) {
        // One event's failure must not stop the rest of the batch — same
        // isolation discipline as the historical-fetch/classify loops.
        console.error("Instagram inbound message processing failed", err);
      }
    }
  }
}

async function processOneMessage(businessAccountId: string, event: MessagingEvent): Promise<void> {
  const message = event.message;
  if (!message) {
    console.log("Instagram webhook: skipping non-message event", JSON.stringify(event));
    return; // postback or other non-message event — out of scope for now
  }
  if (message.is_echo) {
    console.log("Instagram webhook: skipping echo of our own outbound message", message.mid);
    return;
  }
  if (!message.text) {
    console.log("Instagram webhook: skipping message with no text (media/attachment)", message.mid);
    return; // media/attachment-only — not handled yet, logged as a gap below
  }

  const connection = await getConnectionByExternalAccountId(businessAccountId);
  if (!connection) {
    console.error(`Instagram webhook: no active connection for account ${businessAccountId}`);
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
    await sendMessage(connection.accessToken, businessAccountId, event.sender.id, result.response);
    // Sent as a separate follow-up message, not combined into one call —
    // Instagram's message payload is either text or an attachment, never
    // both at once (confirmed against the current Messaging API docs,
    // 2026-08-21) — same as how a human would naturally send a caption
    // then a photo. Native inline attachment, not a text link: this is
    // what keeps the customer in the DM thread instead of sending them to
    // an external site (founder request, same date).
    if (result.mediaUrl) {
      await sendMediaMessage(
        connection.accessToken,
        businessAccountId,
        event.sender.id,
        result.mediaUrl,
        inferMediaType(result.mediaUrl),
      );
    }
  }
}

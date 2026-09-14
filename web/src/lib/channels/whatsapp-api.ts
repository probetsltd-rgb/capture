import "server-only";

// Thin client for the WhatsApp Cloud API + Embedded Signup (PLANS.md next
// channel after Instagram, DEP-1 cleared 2026-09-08). Every endpoint here
// was verified against Meta's current docs during this build, not recalled
// from training data — the Instagram integration's own history (three
// separate live token-exchange failures where docs disagreed with actual
// behavior, see instagram-api.ts) is the standing reason not to trust
// memory on this surface.

const GRAPH_BASE = "https://graph.facebook.com/v25.0";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// Embedded Signup's own hosted flow returns a short-lived (~30s TTL) code
// to the frontend on completion — this exchanges it for a Business
// Integration System User access token scoped to that one business's WABA.
// GET with client_id/client_secret/code, not POST/multipart like
// Instagram's exchange — confirmed against Meta's Facebook Login for
// Business docs, deliberately not assumed to match Instagram's shape just
// because both are Meta endpoints (that assumption is exactly what cost
// real time during the Instagram build).
export type ExchangedToken = { accessToken: string; expiresInSeconds: number | null };

export async function exchangeCodeForBusinessToken(code: string): Promise<ExchangedToken> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", requireEnv("WHATSAPP_APP_ID"));
  url.searchParams.set("client_secret", requireEnv("WHATSAPP_APP_SECRET"));
  url.searchParams.set("code", code);

  const response = await fetch(url.toString());
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`WhatsApp code exchange failed: ${response.status} ${bodyText}`);
  }
  const parsed = JSON.parse(bodyText);
  if (!parsed?.access_token) {
    console.error("WhatsApp code exchange: unexpected response shape", { topLevelKeys: Object.keys(parsed ?? {}) });
    throw new Error("WhatsApp code exchange returned no access_token — see logged response shape");
  }
  return { accessToken: parsed.access_token, expiresInSeconds: parsed.expires_in ?? null };
}

// Founder decision 2026-09-08: the "60 Expiration Token" Embedded Signup
// configuration template was the only one available that actually grants
// messaging access (the other, "Measurement Partner", is read-only) — so
// every connected business's token expires in 60 days unless refreshed.
// This refresh is server-to-server, no re-authorization from the business
// needed (confirmed against Meta's docs: set_token_expires_in_60_days=true
// is what makes this a renewal rather than a plain, still-expiring
// token-info lookup). Must be called while the current token is still
// valid — a fully expired token can't be refreshed, only replaced by
// redoing Embedded Signup, which is exactly what api/cron/
// refresh-channel-tokens exists to make sure never happens in practice.
export async function refreshBusinessToken(currentToken: string): Promise<ExchangedToken> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", requireEnv("WHATSAPP_APP_ID"));
  url.searchParams.set("client_secret", requireEnv("WHATSAPP_APP_SECRET"));
  url.searchParams.set("fb_exchange_token", currentToken);
  url.searchParams.set("set_token_expires_in_60_days", "true");

  const response = await fetch(url.toString());
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`WhatsApp token refresh failed: ${response.status} ${bodyText}`);
  }
  const parsed = JSON.parse(bodyText);
  if (!parsed?.access_token) {
    throw new Error(`WhatsApp token refresh: unexpected response shape — ${bodyText}`);
  }
  return { accessToken: parsed.access_token, expiresInSeconds: parsed.expires_in ?? null };
}

export type PhoneNumberDetails = { displayPhoneNumber: string | null; verifiedName: string | null };

// Embedded Signup's postMessage hands the frontend a phone_number_id but no
// human-readable number — fetched here server-side with the freshly
// exchanged token, rather than trusting anything the frontend could send
// unverified in the callback POST body.
export async function fetchPhoneNumberDetails(accessToken: string, phoneNumberId: string): Promise<PhoneNumberDetails> {
  const url = new URL(`${GRAPH_BASE}/${phoneNumberId}`);
  url.searchParams.set("fields", "display_phone_number,verified_name");
  const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`WhatsApp phone number lookup failed: ${response.status} ${bodyText}`);
  }
  const parsed = JSON.parse(bodyText);
  return { displayPhoneNumber: parsed.display_phone_number ?? null, verifiedName: parsed.verified_name ?? null };
}

// Required once per WABA so Meta actually delivers webhook events for it to
// this app — same "OAuth consent alone doesn't enrol you for delivery" gap
// already found and fixed for Instagram (subscribeToWebhooks there,
// 2026-08-31). Confirmed against Meta's current WhatsApp webhooks docs:
// POST with no body, not the subscribed_fields query param Instagram uses
// — field subscription for WhatsApp is configured once at the App
// Dashboard level (Configuration → Webhook), not per-WABA.
export async function subscribeToWebhooks(accessToken: string, wabaId: string): Promise<void> {
  const response = await fetch(`${GRAPH_BASE}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`WhatsApp webhook subscribe failed: ${response.status} ${bodyText}`);
  }
  const parsed = JSON.parse(bodyText);
  if (parsed?.success !== true) {
    throw new Error(`WhatsApp webhook subscribe: unexpected response — ${bodyText}`);
  }
}

// Only valid within WhatsApp's 24-hour customer-service window (same
// constraint as Instagram's sendMessage) — satisfied by construction here,
// since every caller sends in direct response to a just-received inbound
// message. Anything business-initiated outside that window needs a
// pre-approved template instead (DEP-3, still open, unrelated to the
// live-reply path this serves).
export async function sendMessage(
  accessToken: string,
  phoneNumberId: string,
  recipientWaId: string,
  text: string,
): Promise<void> {
  const response = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientWaId,
      type: "text",
      text: { body: text },
    }),
  });
  if (!response.ok) {
    throw new Error(`WhatsApp send message failed: ${response.status} ${await response.text()}`);
  }
}

export type MediaType = "image" | "video";

// Mirrors Instagram's sendMediaMessage (same founder request: a native
// inline attachment, not a link) — WhatsApp's payload shape is its own,
// verified separately rather than assumed identical: {image: {link}} /
// {video: {link}}, keyed by the same `type` field as the text message
// above, not a generic `attachment` wrapper like Instagram's.
export async function sendMediaMessage(
  accessToken: string,
  phoneNumberId: string,
  recipientWaId: string,
  mediaUrl: string,
  mediaType: MediaType,
): Promise<void> {
  const response = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientWaId,
      type: mediaType,
      [mediaType]: { link: mediaUrl },
    }),
  });
  if (!response.ok) {
    throw new Error(`WhatsApp send media message failed: ${response.status} ${await response.text()}`);
  }
}

// Founder request 2026-09-08: escalation alerts to a team member's own
// WhatsApp number — that recipient has essentially never messaged
// Capture's business number, so this is a business-initiated send outside
// any 24h session window and MUST go through an approved template, not
// plain sendMessage() text (confirmed by two real rejections while
// designing the `escalation_alert` template itself: "Parameters words
// ratio exceeds limit" for too few fixed words around 4 variables, then
// "Leading or trailing params not allowed" for ending on a variable —
// both real, documented Meta template-content rules, not guessed at).
// Return type added 2026-09-14 (DEV-48, cross-channel reply threading): the
// wamid Meta hands back is the only handle available later to recognize a
// recipient's WhatsApp "swipe to reply" quote of this exact message — see
// whatsapp_reply_routes / lib/notifications/whatsapp-reply-routing.ts.
// `null` on a real send failure is unreachable (the throw below fires
// first) — it only covers a response shape genuinely missing `messages[0]`,
// which would mean Meta accepted the send but this code can't correlate a
// reply to it; callers must treat that as "no id available," not an error.
export async function sendTemplateMessage(
  accessToken: string,
  phoneNumberId: string,
  recipientWaId: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[],
): Promise<string | null> {
  const response = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientWaId,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: "body",
            parameters: bodyParameters.map((text) => ({ type: "text", text })),
          },
        ],
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`WhatsApp template send failed: ${response.status} ${await response.text()}`);
  }
  const result = (await response.json()) as { messages?: { id?: string }[] };
  return result.messages?.[0]?.id ?? null;
}

export type TemplateCategory = "utility" | "marketing" | "authentication";

export type CreatedTemplate = { id: string; status: string; category: string };

// Founder request 2026-09-08: minimal template creation, built for two real
// reasons at once — it's the App Review video Meta requires to grant
// Advanced Access on whatsapp_business_management (Standard Access only
// works on Capture's own WABA, not a genuinely separate client's like
// Rentit's), and it's real groundwork for DEP-3 (pre-approved templates
// for business-initiated sends outside the 24h window — Recover follow-ups,
// Prevent nudges). Confirmed against Meta's current docs during this
// build: POST with a plain BODY component, `example.body_text` required
// whenever the body text contains a `{{n}}` placeholder (Meta's own
// approval process needs a realistic example to review against, not just
// the template structure) — omitted entirely when there are no
// placeholders, since an empty example array is itself invalid.
export async function createMessageTemplate(
  accessToken: string,
  wabaId: string,
  params: { name: string; category: TemplateCategory; language: string; bodyText: string; bodyExample?: string[] },
): Promise<CreatedTemplate> {
  const hasPlaceholder = /\{\{\d+\}\}/.test(params.bodyText);
  const bodyComponent: Record<string, unknown> = { type: "BODY", text: params.bodyText };
  if (hasPlaceholder) {
    bodyComponent.example = { body_text: [params.bodyExample ?? []] };
  }

  const response = await fetch(`${GRAPH_BASE}/${wabaId}/message_templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: params.name,
      category: params.category,
      language: params.language,
      components: [bodyComponent],
    }),
  });
  const bodyTextResponse = await response.text();
  if (!response.ok) {
    throw new Error(`WhatsApp template creation failed: ${response.status} ${bodyTextResponse}`);
  }
  return JSON.parse(bodyTextResponse);
}

const VIDEO_EXTENSIONS = [".mp4", ".ogg", ".avi", ".mov", ".webm"];

export function inferMediaType(url: string): MediaType {
  const path = url.split("?")[0].toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext)) ? "video" : "image";
}

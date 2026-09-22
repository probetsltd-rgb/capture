import "server-only";

// Thin client for Facebook Page Messenger + Facebook Login for Business
// (OUTSTANDINGS.md "Channel roadmap confirmed 2026-09-08" — the fourth
// channel, additive after WhatsApp, scoped in chat before building rather
// than assumed identical to Instagram/WhatsApp just because all three are
// Meta endpoints — same discipline that cost real time on the Instagram
// build (see instagram-api.ts) and was re-confirmed worth keeping on the
// WhatsApp build (whatsapp-api.ts). Endpoints below verified against
// Meta's current Messenger Platform + Graph API docs during this build.

const GRAPH_BASE = "https://graph.facebook.com/v25.0";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// Facebook Login for Business (App Dashboard > Facebook Login for Business
// > Configurations) supports a Configuration scoped to Page access the same
// way WhatsApp's Embedded Signup does — a config_id the frontend passes to
// FB.login(), which (with response_type: "code") hands back a short-lived
// code instead of a client-side token. Exchanged here server-side, same
// "never trust a token the frontend could send unverified" discipline as
// every other channel in this codebase, not because Meta strictly requires
// the code-exchange form for this particular login type (it doesn't — a
// direct client-side User token is also valid here, unlike WhatsApp's
// System User flow, which requires the code exchange).
export type ExchangedToken = { accessToken: string; expiresInSeconds: number | null };

export async function exchangeCodeForUserToken(code: string): Promise<ExchangedToken> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", requireEnv("FACEBOOK_APP_ID"));
  url.searchParams.set("client_secret", requireEnv("FACEBOOK_APP_SECRET"));
  url.searchParams.set("code", code);

  const response = await fetch(url.toString());
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Facebook code exchange failed: ${response.status} ${bodyText}`);
  }
  const parsed = JSON.parse(bodyText);
  if (!parsed?.access_token) {
    console.error("Facebook code exchange: unexpected response shape", { topLevelKeys: Object.keys(parsed ?? {}) });
    throw new Error("Facebook code exchange returned no access_token — see logged response shape");
  }
  return { accessToken: parsed.access_token, expiresInSeconds: parsed.expires_in ?? null };
}

// A short-lived User token (from the code exchange above, via SDK.js's
// implicit flow with no explicit redirect_uri) is only valid ~1-2 hours.
// Exchanging it for a long-lived one before the /me/accounts call matters
// because Page Access Tokens obtained from a long-lived User token do not
// carry an expiration date (Meta's own documented behavior), whereas ones
// obtained from a short-lived User token inherit its ~1-hour lifetime — the
// same token-lifetime-inheritance mechanic WhatsApp's refreshBusinessToken
// comment describes, just consumed once here rather than refreshed
// periodically.
export async function exchangeForLongLivedUserToken(shortLivedToken: string): Promise<ExchangedToken> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", requireEnv("FACEBOOK_APP_ID"));
  url.searchParams.set("client_secret", requireEnv("FACEBOOK_APP_SECRET"));
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const response = await fetch(url.toString());
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Facebook long-lived token exchange failed: ${response.status} ${bodyText}`);
  }
  const parsed = JSON.parse(bodyText);
  if (!parsed?.access_token) {
    throw new Error(`Facebook long-lived token exchange: unexpected response shape — ${bodyText}`);
  }
  return { accessToken: parsed.access_token, expiresInSeconds: parsed.expires_in ?? null };
}

export type FacebookPage = { id: string; name: string; access_token: string };

// GET /me/accounts returns every Page the logged-in user manages, each
// with its own Page Access Token already derived from the User token
// passed in — no separate per-page exchange call needed.
export async function fetchManagedPages(userAccessToken: string): Promise<FacebookPage[]> {
  const url = new URL(`${GRAPH_BASE}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token");
  url.searchParams.set("access_token", userAccessToken);

  const response = await fetch(url.toString());
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Facebook managed-pages fetch failed: ${response.status} ${bodyText}`);
  }
  const parsed = JSON.parse(bodyText);
  return (parsed?.data as FacebookPage[]) ?? [];
}

// Same "OAuth/login consent alone does not enrol you for webhook delivery"
// gap already found and fixed for Instagram and WhatsApp — required once
// per Page, not optional. pages_manage_metadata is the permission this
// call itself needs (distinct from pages_messaging, which governs sending/
// receiving messages once subscribed).
export async function subscribeToPageWebhooks(pageAccessToken: string, pageId: string): Promise<void> {
  const url = new URL(`${GRAPH_BASE}/${pageId}/subscribed_apps`);
  url.searchParams.set("subscribed_fields", "messages");
  url.searchParams.set("access_token", pageAccessToken);

  const response = await fetch(url.toString(), { method: "POST" });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Facebook Page webhook subscribe failed: ${response.status} ${bodyText}`);
  }
  const parsed = JSON.parse(bodyText);
  if (parsed?.success !== true) {
    throw new Error(`Facebook Page webhook subscribe: unexpected response — ${bodyText}`);
  }
}

// Sends a real, customer-facing message. messaging_type "RESPONSE" is
// required and correct here — every caller sends in direct response to a
// just-received inbound webhook message, same as Instagram's 24-hour
// customer-service-window discipline. Unlike Instagram/WhatsApp's Bearer
// header, the Send API takes the Page token as an access_token query param
// (confirmed against Meta's current Messenger Platform docs).
export async function sendMessage(pageAccessToken: string, pageId: string, recipientPsid: string, text: string): Promise<void> {
  const url = new URL(`${GRAPH_BASE}/${pageId}/messages`);
  url.searchParams.set("access_token", pageAccessToken);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientPsid }, messaging_type: "RESPONSE", message: { text } }),
  });
  if (!response.ok) {
    throw new Error(`Facebook send message failed: ${response.status} ${await response.text()}`);
  }
}

// Mirrors Instagram's sendMediaMessage — a native inline attachment, not a
// text link the customer has to click out to.
export type MediaType = "image" | "video";

export async function sendMediaMessage(
  pageAccessToken: string,
  pageId: string,
  recipientPsid: string,
  mediaUrl: string,
  mediaType: MediaType,
): Promise<void> {
  const url = new URL(`${GRAPH_BASE}/${pageId}/messages`);
  url.searchParams.set("access_token", pageAccessToken);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientPsid },
      messaging_type: "RESPONSE",
      message: { attachment: { type: mediaType, payload: { url: mediaUrl, is_reusable: false } } },
    }),
  });
  if (!response.ok) {
    throw new Error(`Facebook send media message failed: ${response.status} ${await response.text()}`);
  }
}

const VIDEO_EXTENSIONS = [".mp4", ".ogg", ".avi", ".mov", ".webm"];

export function inferMediaType(url: string): MediaType {
  const path = url.split("?")[0].toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext)) ? "video" : "image";
}

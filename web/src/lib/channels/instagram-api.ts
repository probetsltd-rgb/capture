import "server-only";

// Thin client for the Instagram API with Instagram Login OAuth flow
// (PLANS.md Phase 5.2). Endpoints verified against Meta's current docs
// 2026-08-14 — this surface has changed more than once historically, do
// not "fix" these URLs from memory without re-checking.

const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_EXCHANGE_URL = "https://api.instagram.com/oauth/access_token";
const LONG_LIVED_EXCHANGE_URL = "https://graph.instagram.com/access_token";
const ME_URL = "https://graph.instagram.com/me";

// instagram_business_basic + instagram_business_manage_messages are the
// current (post-Jan-2025) scope names — the older business_basic /
// business_manage_messages names were deprecated.
const SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"];

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", requireEnv("INSTAGRAM_APP_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(","));
  url.searchParams.set("state", state);
  // Confirmed against Meta's current docs 2026-08-20: forces the
  // credentials/login prompt even if the browser already has an open
  // Instagram session, rather than silently reusing it. Always on, not a
  // toggle — deliberate re-auth on every connect/reconnect is the safer
  // default (confirms intent rather than trusting a session that happens
  // to be open), and it's what makes the OAuth screencast's required
  // logged-out-to-logged-in moment (App Review submission guide, see
  // META_APP_REVIEW.md §4) reliably reproducible on demand. Not confirmed
  // (docs don't say either way) whether this also forces Meta's permission
  // list to redisplay for an account that has already granted this exact
  // app/scope combination before — that specific need is handled by
  // revoking the app from Instagram's own Accounts Center, not by this
  // parameter; see OUTSTANDINGS.md DEP-4 for the full note.
  url.searchParams.set("force_reauth", "true");
  return url.toString();
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

type ShortLivedTokenResponse = {
  access_token: string;
  user_id: string;
  permissions?: string[];
};

// POST, multipart/form-data per Meta's docs — not JSON.
export async function exchangeCodeForShortLivedToken(
  code: string,
  redirectUri: string,
): Promise<ShortLivedTokenResponse> {
  const form = new FormData();
  form.set("client_id", requireEnv("INSTAGRAM_APP_ID"));
  form.set("client_secret", requireEnv("INSTAGRAM_APP_SECRET"));
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", redirectUri);
  form.set("code", code);

  const response = await fetch(TOKEN_EXCHANGE_URL, { method: "POST", body: form });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Instagram token exchange failed: ${response.status} ${bodyText}`);
  }

  const parsed = JSON.parse(bodyText);
  // Two live attempts against the long-lived exchange below both failed
  // with Meta's generic "Unsupported request" error under different HTTP
  // methods — that error code is documented as a broad catch-all for
  // several unrelated causes, not literally "wrong method" both times.
  // The most likely real cause: this response's actual shape differs from
  // what every doc/example claims (flat {access_token, user_id}), so
  // access_token silently comes through as undefined downstream. Fail
  // loudly here instead, with the real shape logged (never the token
  // value itself), so the next real attempt gives ground truth instead of
  // another guess.
  if (!parsed?.access_token) {
    console.error(
      "Instagram short-lived token exchange: unexpected response shape",
      { topLevelKeys: Object.keys(parsed ?? {}), raw: bodyText.slice(0, 500) },
    );
    throw new Error("Instagram short-lived token exchange returned no access_token — see logged response shape");
  }
  return parsed;
}

type LongLivedTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds
};

export async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<LongLivedTokenResponse> {
  // Three real live attempts (2026-08-15) have now failed here, each with
  // Meta's generic IGApiException code 100 "Unsupported request": GET
  // rejected as "method type: get", POST rejected as "method type: post"
  // on the identical call, then GET rejected again on a *confirmed
  // well-formed* token (213 chars, real "IGAA" prefix, logged below) — so
  // this is not a malformed-token or wrong-method problem, both were
  // directly disproven by evidence. Trying a `User-Agent` header next: a
  // documented pattern with some Meta endpoints is a generic-looking
  // catch-all error for requests that look like non-browser bot traffic,
  // which a bare Node/undici fetch() has no default for.
  const url = new URL(LONG_LIVED_EXCHANGE_URL);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", requireEnv("INSTAGRAM_APP_SECRET"));
  url.searchParams.set("access_token", shortLivedToken);

  console.error("Instagram long-lived exchange request", {
    tokenLength: shortLivedToken.length,
    tokenPrefix: shortLivedToken.slice(0, 6),
  });

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; CaptureEngage/1.0; +https://capture.com.ng)",
      Accept: "application/json",
    },
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Instagram long-lived token exchange failed: ${response.status} ${bodyText}`);
  }
  return JSON.parse(bodyText);
}

type ProfileResponse = {
  user_id: string;
  username: string;
};

export async function fetchProfile(accessToken: string): Promise<ProfileResponse> {
  const url = new URL(ME_URL);
  url.searchParams.set("fields", "user_id,username");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Instagram profile fetch failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

// Historical message retrieval (PLANS.md Phase 5.2 — 30-day baseline).
// Verified directly against the real, live `rentit_online` connection
// 2026-08-15 before writing this — not assumed from docs, given how
// unreliable Meta's own docs proved to be earlier in this build. Standard
// Graph API pagination: `paging.next` is a complete, ready-to-fetch URL
// with the access token already embedded.

type GraphPage<T> = {
  data: T[];
  paging?: { cursors?: { after?: string }; next?: string };
};

type ConversationSummary = { id: string; updated_time: string };

// Conversations come back newest-first (confirmed against real data), so
// callers can stop paginating as soon as updated_time crosses their
// cutoff instead of always walking the full history.
export async function fetchConversationList(
  accessToken: string,
  igUserId: string,
  stopBefore: Date,
  maxConversations: number,
): Promise<ConversationSummary[]> {
  const results: ConversationSummary[] = [];
  let url: string | undefined = `https://graph.instagram.com/${igUserId}/conversations?access_token=${accessToken}`;

  while (url && results.length < maxConversations) {
    const response = await fetch(url);
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Instagram conversations list failed: ${response.status} ${bodyText}`);
    }
    const page: GraphPage<ConversationSummary> = JSON.parse(bodyText);

    let hitCutoff = false;
    for (const conv of page.data) {
      if (new Date(conv.updated_time) < stopBefore) {
        hitCutoff = true;
        break;
      }
      results.push(conv);
      if (results.length >= maxConversations) break;
    }

    if (hitCutoff) break;
    url = page.paging?.next;
  }

  return results;
}

export type InstagramMessage = {
  id: string;
  created_time: string;
  from: { id: string; username: string };
  to: { data: { id: string; username: string }[] };
  message?: string;
};

export async function fetchConversationMessages(
  accessToken: string,
  conversationId: string,
  maxMessages: number,
): Promise<InstagramMessage[]> {
  const results: InstagramMessage[] = [];
  let url: string | undefined =
    `https://graph.instagram.com/${conversationId}/messages?fields=id,created_time,from,to,message&access_token=${accessToken}`;

  while (url && results.length < maxMessages) {
    const response = await fetch(url);
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Instagram messages fetch failed: ${response.status} ${bodyText}`);
    }
    const page: GraphPage<InstagramMessage> = JSON.parse(bodyText);
    results.push(...page.data);
    url = page.paging?.next;
  }

  return results.slice(0, maxMessages);
}

// Sends a real, customer-facing message. Verified against Meta's current
// docs 2026-08-15 — POST with the token in an Authorization header, unlike
// every read endpoint above (which use an access_token query param). Only
// valid within Instagram's 24-hour customer-service window, which every
// caller here satisfies by construction (always sent in direct response to
// a just-received inbound webhook message). Message text capped at 1000
// bytes per Meta's documented limit; callers must not send longer text.
export async function sendMessage(
  accessToken: string,
  businessAccountId: string,
  recipientId: string,
  text: string,
): Promise<void> {
  const response = await fetch(`https://graph.instagram.com/v25.0/${businessAccountId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  if (!response.ok) {
    throw new Error(`Instagram send message failed: ${response.status} ${await response.text()}`);
  }
}

// Founder request 2026-08-21: send a photo/video as a native inline
// attachment in the DM thread — not a text message containing a link the
// customer has to click out to. Confirmed against Meta's current
// Instagram Messaging API docs (not assumed): the `attachments` payload
// shape below, requiring a publicly-hosted URL Instagram fetches itself
// (Vercel Blob's public store — see lib/media/upload.ts), same endpoint
// and auth as sendMessage above, just a different `message` body shape.
// Documented limits: image PNG/JPEG up to 8MB, video MP4/OGG/AVI/MOV/WebM
// up to 25MB — enforced at upload time (lib/media/upload.ts), not here.
export type MediaType = "image" | "video";

export async function sendMediaMessage(
  accessToken: string,
  businessAccountId: string,
  recipientId: string,
  mediaUrl: string,
  mediaType: MediaType,
): Promise<void> {
  const response = await fetch(`https://graph.instagram.com/v25.0/${businessAccountId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { attachment: { type: mediaType, payload: { url: mediaUrl } } },
    }),
  });
  if (!response.ok) {
    throw new Error(`Instagram send media message failed: ${response.status} ${await response.text()}`);
  }
}

const VIDEO_EXTENSIONS = [".mp4", ".ogg", ".avi", ".mov", ".webm"];

// Deliberately not a stored column (see the migration's own comment) —
// Vercel Blob preserves the original filename/extension in the URL, so
// this is reliable without an extra field to keep in sync.
export function inferMediaType(url: string): MediaType {
  const path = url.split("?")[0].toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext)) ? "video" : "image";
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnBusinessId } from "@/lib/business-membership";
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchProfile,
} from "@/lib/channels/instagram-api";
import { saveInstagramConnection, fetchHistoricalMessages } from "@/lib/channels/instagram";
import { after } from "next/server";

// OAuth callback for the Instagram connect flow (PLANS.md Phase 5.2).
// Redirect target after the user approves (or rejects) access on
// Instagram's authorize screen — see connect/route.ts for how the flow
// starts, including the CSRF-protection nonce this route checks.
const STATE_COOKIE = "ig_oauth_state";
const REDIRECT_URI = "https://capture.com.ng/api/channels/instagram/callback";

function redirectToDashboard(
  request: NextRequest,
  status: "connected" | "connected_degraded" | "error",
  reason?: string,
) {
  const url = new URL("/dashboard", request.url);
  url.searchParams.set("instagram", status);
  if (reason) url.searchParams.set("reason", reason);
  const response = NextResponse.redirect(url);
  response.cookies.delete(STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const oauthError = searchParams.get("error");
  if (oauthError) {
    return redirectToDashboard(request, "error", "denied");
  }

  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");
  if (!code || !stateRaw) {
    return redirectToDashboard(request, "error", "missing_params");
  }

  let state: { nonce: string; businessId: string };
  try {
    state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
  } catch {
    return redirectToDashboard(request, "error", "bad_state");
  }

  const cookieNonce = request.cookies.get(STATE_COOKIE)?.value;
  if (!cookieNonce || cookieNonce !== state.nonce) {
    return redirectToDashboard(request, "error", "state_mismatch");
  }

  // Defense in depth beyond the nonce check: the businessId embedded in
  // state must also match the actual signed-in session's own business,
  // not just be internally consistent with a valid nonce.
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return redirectToDashboard(request, "error", "not_signed_in");
  }
  const userId = claims.claims.sub as string;
  const ownBusinessId = await getOwnBusinessId(supabase, userId);
  if (!ownBusinessId || ownBusinessId !== state.businessId) {
    return redirectToDashboard(request, "error", "business_mismatch");
  }

  let usableToken: string;
  let expiresInSeconds: number;
  let degraded = false;

  try {
    const shortLived = await exchangeCodeForShortLivedToken(code, REDIRECT_URI);

    // Kept non-fatal even though the underlying root cause is now fixed
    // (an Instagram account has to be registered in the Meta App's own
    // "Generate access tokens" list before real Graph API calls work for
    // it — a Development-mode requirement, not a bug in this code; see
    // OUTSTANDINGS.md's resolved entry and TESTS.md 2026-08-15 for the
    // full investigation). Left in place as a safety net for the same
    // failure mode recurring on a future business's account, so a
    // connection still saves (short-lived, ~1hr) instead of failing
    // outright while the founder investigates.
    try {
      const longLived = await exchangeForLongLivedToken(shortLived.access_token);
      usableToken = longLived.access_token;
      expiresInSeconds = longLived.expires_in;
    } catch (longLivedErr) {
      console.error("Instagram long-lived exchange failed, falling back to short-lived token", longLivedErr);
      usableToken = shortLived.access_token;
      expiresInSeconds = 3300; // ~55 min, conservative under Instagram's ~1hr short-lived window
      degraded = true;
    }

    const profile = await fetchProfile(usableToken);

    await saveInstagramConnection({
      businessId: ownBusinessId,
      externalAccountId: profile.user_id,
      username: profile.username,
      accessToken: usableToken,
      expiresInSeconds,
    });
  } catch (err) {
    console.error("Instagram connect failed", err);
    return redirectToDashboard(request, "error", "exchange_failed");
  }

  // 30-day baseline (addendum §16) — after the redirect response, not
  // blocking it, same pattern as the upload path's classification step.
  // A failure here must not undo a real, already-saved connection: the
  // connect itself succeeded, this is a best-effort backfill on top of it.
  after(async () => {
    try {
      const result = await fetchHistoricalMessages(ownBusinessId);
      console.log(`Instagram historical fetch: imported ${result.conversationsImported} conversations`);
    } catch (err) {
      console.error("Instagram historical fetch failed", err);
    }
  });

  return redirectToDashboard(request, degraded ? "connected_degraded" : "connected");
}

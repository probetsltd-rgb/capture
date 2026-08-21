import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getOwnBusinessId } from "@/lib/business-membership";
import { buildAuthorizeUrl } from "@/lib/channels/instagram-api";

// Initiates the Instagram OAuth connect flow (PLANS.md Phase 5.2). The
// business_id comes from the caller's own authenticated session
// (getOwnBusinessId), never from a query param — otherwise a crafted link
// could point one business's connect flow at another's businessId.
//
// redirect_uri must exactly match what's registered in the Meta App
// (Meta does not support wildcard redirect URIs) — production only so
// far, see PLANS.md Phase 5.2. Connecting from preview/dev will fail at
// Meta's authorize step until those origins are also registered.
const REDIRECT_URI = "https://capture.com.ng/api/channels/instagram/callback";
const STATE_COOKIE = "ig_oauth_state";

export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return NextResponse.redirect(new URL("/login?next=/dashboard", REDIRECT_URI));
  }

  const userId = claims.claims.sub as string;
  const businessId = await getOwnBusinessId(supabase, userId);
  if (!businessId) {
    return NextResponse.redirect(new URL("/onboarding", REDIRECT_URI));
  }

  // CSRF protection: a random nonce is both embedded in `state` (sent to
  // Meta, returned on callback) and stored in an httpOnly cookie only this
  // browser holds. The callback rejects unless they match.
  const nonce = randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ nonce, businessId })).toString("base64url");

  const response = NextResponse.redirect(buildAuthorizeUrl(REDIRECT_URI, state));
  response.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/api/channels/instagram",
  });
  return response;
}

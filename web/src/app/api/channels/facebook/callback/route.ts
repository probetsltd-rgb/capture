import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnBusinessId } from "@/lib/business-membership";
import { exchangeCodeForUserToken, exchangeForLongLivedUserToken, fetchManagedPages, subscribeToPageWebhooks } from "@/lib/channels/facebook-api";
import { saveFacebookConnection } from "@/lib/channels/facebook";

// Facebook Login for Business's popup flow (FB.login with config_id) hands
// its result back to the frontend directly, same as WhatsApp's Embedded
// Signup — no separate browser navigation, so no CSRF nonce/state cookie
// needed here: the frontend calls this route directly from the same
// authenticated page, with the existing session cookie already attached.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return NextResponse.json({ ok: false, message: "Not signed in." }, { status: 401 });

  const userId = claims.claims.sub as string;
  const businessId = await getOwnBusinessId(supabase, userId);
  if (!businessId) return NextResponse.json({ ok: false, message: "No business for this account." }, { status: 400 });

  const body = await request.json();
  const { code } = body as { code?: string };
  if (!code) return NextResponse.json({ ok: false, message: "Missing code from login flow." }, { status: 400 });

  try {
    const shortLived = await exchangeCodeForUserToken(code);
    const longLived = await exchangeForLongLivedUserToken(shortLived.accessToken);

    const pages = await fetchManagedPages(longLived.accessToken);
    if (pages.length === 0) {
      return NextResponse.json(
        { ok: false, message: "No Facebook Page found for this account — Facebook Page Messenger needs a Page, not a personal profile." },
        { status: 400 },
      );
    }
    // v1 scope cut, same bounded-scope discipline as this codebase's other
    // v1 launches (e.g. website-extract's one-URL-only crawl): auto-connect
    // when exactly one Page is available (the common case for a small
    // business), and ask the owner to leave only the Page they want
    // connected as an admin on their Facebook account when more than one is
    // returned, rather than building a page-picker UI on day one. A real
    // scope cut, stated plainly rather than silently handled.
    if (pages.length > 1) {
      return NextResponse.json(
        {
          ok: false,
          message: `Found ${pages.length} Facebook Pages on this account — Capture can only connect one for now. Please leave only the Page you want connected as an admin on your Facebook account, then try again.`,
        },
        { status: 400 },
      );
    }
    const page = pages[0];

    try {
      await subscribeToPageWebhooks(page.access_token, page.id);
    } catch (err) {
      console.error("Facebook Page webhook subscribe failed", err);
      return NextResponse.json({ ok: false, message: "Connected, but webhook subscription failed — please try again." }, { status: 502 });
    }

    await saveFacebookConnection({
      businessId,
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.access_token,
    });
  } catch (err) {
    console.error("Facebook connect failed", err);
    return NextResponse.json({ ok: false, message: "Could not complete Facebook connection." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, message: "Facebook connected." });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnBusinessId } from "@/lib/business-membership";
import { exchangeCodeForBusinessToken, subscribeToWebhooks, fetchPhoneNumberDetails } from "@/lib/channels/whatsapp-api";
import { saveWhatsAppConnection } from "@/lib/channels/whatsapp";

// Embedded Signup's completion never leaves the page (Meta's hosted flow
// runs in a popup, hands the result back via postMessage) — unlike
// Instagram's redirect-based OAuth callback, there's no separate browser
// navigation and so no CSRF nonce/state cookie needed here: the frontend
// calls this route directly from the same authenticated page, with the
// existing session cookie already attached.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return NextResponse.json({ ok: false, message: "Not signed in." }, { status: 401 });

  const userId = claims.claims.sub as string;
  const businessId = await getOwnBusinessId(supabase, userId);
  if (!businessId) return NextResponse.json({ ok: false, message: "No business for this account." }, { status: 400 });

  const body = await request.json();
  const { code, wabaId, phoneNumberId } = body as { code?: string; wabaId?: string; phoneNumberId?: string };
  if (!code || !wabaId || !phoneNumberId) {
    return NextResponse.json({ ok: false, message: "Missing code/wabaId/phoneNumberId from signup flow." }, { status: 400 });
  }

  try {
    // Embedded Signup's code has a ~30-second TTL (Meta's own docs) — this
    // must be the very next thing that happens after the frontend receives
    // it, not queued behind anything else.
    const token = await exchangeCodeForBusinessToken(code);

    // Same "OAuth/signup consent alone doesn't enrol you for webhook
    // delivery" gap already found and fixed for Instagram — required once
    // per WABA, not optional.
    try {
      await subscribeToWebhooks(token.accessToken, wabaId);
    } catch (err) {
      console.error("WhatsApp webhook subscribe failed", err);
      return NextResponse.json({ ok: false, message: "Connected, but webhook subscription failed — please try again." }, { status: 502 });
    }

    // The postMessage event hands the frontend a phone_number_id but no
    // human-readable number — fetched here with the freshly exchanged
    // token rather than trusted from anything the frontend could send.
    const phoneDetails = await fetchPhoneNumberDetails(token.accessToken, phoneNumberId);

    await saveWhatsAppConnection({
      businessId,
      phoneNumberId,
      wabaId,
      displayPhoneNumber: phoneDetails.displayPhoneNumber,
      accessToken: token.accessToken,
      expiresInSeconds: token.expiresInSeconds,
    });
  } catch (err) {
    console.error("WhatsApp connect failed", err);
    return NextResponse.json({ ok: false, message: "Could not complete WhatsApp connection." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, message: "WhatsApp connected." });
}

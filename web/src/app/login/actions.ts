"use server";

import { createClient } from "@/lib/supabase/server";

// Any email can request a magic link and authenticate (shouldCreateUser
// defaults true) — access beyond login is gated entirely by
// platform_admins/business_members via RLS, not by who is allowed to
// authenticate. Phase 4 self-service signup (/signup, /onboarding) is what
// actually turns a bare authenticated session into real business access;
// this action is shared by /login and /signup, differing only in `next`.
function safeNext(raw: string | null): string {
  // Relative paths only — a `next` value ends up embedded in an emailed
  // link, so an absolute/protocol-relative URL here would be an open
  // redirect via a crafted magic-link request.
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/admin";
}

export async function requestMagicLink(
  _prevState: { error: string | null; sent: boolean },
  formData: FormData,
): Promise<{ error: string | null; sent: boolean }> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Email is required.", sent: false };
  }

  const next = safeNext(String(formData.get("next") ?? "").trim() || null);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return { error: error.message, sent: false };
  }
  return { error: null, sent: true };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { getSiteUrl } from "@/lib/site-url";

// Any email can request a magic link and authenticate (shouldCreateUser
// defaults true) — access beyond login is gated entirely by
// platform_admins/business_members via RLS, not by who is allowed to
// authenticate. Phase 4 self-service signup (/signup, /onboarding) is what
// actually turns a bare authenticated session into real business access;
// this action is shared by /login and /signup, differing only in `next`.
export async function requestMagicLink(
  _prevState: { error: string | null; sent: boolean },
  formData: FormData,
): Promise<{ error: string | null; sent: boolean }> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Email is required.", sent: false };
  }

  const next = safeNextPath(String(formData.get("next") ?? "").trim() || null);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return { error: error.message, sent: false };
  }
  return { error: null, sent: true };
}

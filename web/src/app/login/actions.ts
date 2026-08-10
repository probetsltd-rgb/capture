"use server";

import { createClient } from "@/lib/supabase/server";

export async function requestMagicLink(
  _prevState: { error: string | null; sent: boolean },
  formData: FormData,
): Promise<{ error: string | null; sent: boolean }> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Email is required.", sent: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Founder/admin auth only for now (Phase 1.1) — business-user signup
      // is a Phase 1.3 concern. shouldCreateUser stays true; access beyond
      // login is still gated by platform_admins/business_members via RLS,
      // not by who is allowed to authenticate.
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    },
  });

  if (error) {
    return { error: error.message, sent: false };
  }
  return { error: null, sent: true };
}

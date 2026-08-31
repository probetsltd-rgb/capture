"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";
import type { RequestCodeState, VerifyCodeState } from "@/app/login/state";

// Founder decision 2026-08-30: switched from a clickable magic link to a
// typed 6-digit code. Two real reasons: (1) corporate/Gmail link-prescanning
// silently "clicks" (and burns) a single-use magic link before the real user
// does — a well-documented failure mode this audience (heavy Gmail users)
// is plausibly exposed to; a typed code can't be consumed by a scanner.
// (2) a typed code matches this audience's existing OTP familiarity from
// banking/mobile-money — more intuitive here despite one extra step, not
// less. The underlying mechanism is unchanged: Supabase's signInWithOtp
// already creates the same one-time token either way — only whether the
// email surfaces it as a link or a code (the email template) and which
// client call redeems it (verifyOtp with token_hash vs. with a typed
// token) differs. Any email is still allowed to authenticate
// (shouldCreateUser defaults true) — access beyond login is gated entirely
// by platform_admins/business_members via RLS, not by who is allowed to
// authenticate. Shared by /login and /signup, differing only in `next`.

export async function requestLoginCode(
  _prevState: RequestCodeState,
  formData: FormData,
): Promise<RequestCodeState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Email is required.", sent: false, email: "" };
  }

  const supabase = await createClient();
  // No emailRedirectTo — this is a typed-code flow now, not a link click.
  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    return { error: error.message, sent: false, email: "" };
  }
  return { error: null, sent: true, email };
}

export async function verifyLoginCode(
  _prevState: VerifyCodeState,
  formData: FormData,
): Promise<VerifyCodeState> {
  const email = String(formData.get("email") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const next = safeNextPath(String(formData.get("next") ?? "").trim() || null);

  if (!email || !code) {
    return { error: "Enter the code from your email." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });

  if (error) {
    return { error: "That code is incorrect or has expired — request a new one." };
  }

  redirect(next);
}

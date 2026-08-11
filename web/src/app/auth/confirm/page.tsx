"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/safe-redirect";

// Client component, not a Route Handler — deliberately. Supabase's magic-link
// email points at Supabase's own hosted /auth/v1/verify endpoint, which (with
// the default email templates, i.e. {{ .ConfirmationURL }}) redirects back
// here with the session in the URL *hash fragment*
// (#access_token=...&refresh_token=...), not query params. Fragments never
// reach the server, so a server Route Handler reading searchParams alone
// silently fails on the standard flow — confirmed by testing against a real
// generated magic link, not assumed. This also still handles the token_hash
// query-param flow, in case the email template is ever customized to use
// {{ .TokenHash }} instead.
function ConfirmInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // Re-validated here, not just at the /login end that produced the link:
    // this component is the actual redirect sink and the value arrives from
    // a URL, so it cannot be assumed to have come from our own form.
    const next = safeNextPath(searchParams.get("next"));

    async function complete() {
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type") as EmailOtpType | null;

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
        if (error) {
          setError(error.message);
          return;
        }
        router.replace(next);
        return;
      }

      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          setError(error.message);
          return;
        }
        router.replace(next);
        return;
      }

      setError("This sign-in link is invalid or has expired.");
    }

    complete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "sans-serif" }}>
        <h1>Sign-in failed</h1>
        <p>{error}</p>
        <p>
          <a href="/login">Try again</a>
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "sans-serif" }}>
      <p>Signing you in…</p>
    </main>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={<p style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "sans-serif" }}>Loading…</p>}>
      <ConfirmInner />
    </Suspense>
  );
}

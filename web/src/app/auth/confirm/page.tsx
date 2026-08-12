"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/safe-redirect";
import { SiteNav, SiteFooter } from "@/components/SiteChrome";

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

      // No token_hash/type and no hash-fragment tokens at all — most often
      // because the link was already used (each one is single-use; a second
      // click, or an email app pre-opening the link to scan it for safety,
      // both consume it before the real click), or because it's simply past
      // its 1-hour expiry. Named explicitly rather than a generic "invalid"
      // so a real, common cause doesn't read as a mystery failure.
      setError("This link has already been used or has expired.");
    }

    complete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="page">
        <SiteNav />
        <main>
          <div className="shell center-page">
            <h1 className="h2">Sign-in link didn&apos;t work</h1>
            <p className="body" style={{ marginTop: "var(--s3)" }}>
              {error}
            </p>
            <p className="meta" style={{ marginTop: "var(--s3)" }}>
              This usually happens when a link is clicked twice, opened by an email app scanning
              it for safety, or used more than an hour after it was sent — each link only works
              once. Request a fresh one below.
            </p>
            <Link href="/login" className="btn btn--primary" style={{ marginTop: "var(--s5)" }}>
              Send a new sign-in link
            </Link>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="page">
      <SiteNav />
      <main>
        <div className="shell center-page">
          <p className="body">Signing you in…</p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="page">
          <SiteNav />
          <main>
            <div className="shell center-page">
              <p className="body">Loading…</p>
            </div>
          </main>
          <SiteFooter />
        </div>
      }
    >
      <ConfirmInner />
    </Suspense>
  );
}

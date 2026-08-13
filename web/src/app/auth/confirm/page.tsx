"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/safe-redirect";
import { SiteNav, SiteFooter } from "@/components/SiteChrome";

// Client component, not a Route Handler — deliberately. Handles three
// distinct shapes Supabase can deliver a session in, because which one
// shows up depends on client config, not something we get to pick per
// request:
//
// 1. PKCE `?code=...` query param — the actual default and what every real
//    magic-link send from this app produces, since @supabase/ssr's clients
//    default flowType to "pkce" (confirmed via GoTrue's own auth logs:
//    grant_type "pkce", successful /token exchange). detectSessionInUrl
//    defaults to true for the browser client, so createClient() below
//    already starts exchanging this code the moment it's instantiated —
//    calling exchangeCodeForSession ourselves here would race that
//    in-flight exchange and fail, since each code is single-use. This is
//    the real bug that shipped for a while: this branch didn't exist, so
//    every real PKCE link fell through to the generic "expired" error
//    below even when GoTrue's own logs showed the login had already
//    succeeded server-side.
// 2. `token_hash` + `type` query params — the older OTP-verify flow, kept
//    in case the email template is ever customized to {{ .TokenHash }}.
// 3. `#access_token=...&refresh_token=...` hash fragment — the implicit
//    flow's shape. Fragments never reach the server, which is why this is
//    a client component and not a Route Handler.
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
    let settled = false;

    // Catches the PKCE case: createClient()'s automatic detectSessionInUrl
    // handling completes asynchronously and fires SIGNED_IN once it does,
    // independent of the explicit checks in complete() below.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (settled || event !== "SIGNED_IN" || !session) return;
      settled = true;
      router.replace(next);
    });

    async function complete() {
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type") as EmailOtpType | null;

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
        if (settled) return;
        if (error) {
          settled = true;
          setError(error.message);
          return;
        }
        settled = true;
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
        if (settled) return;
        if (error) {
          settled = true;
          setError(error.message);
          return;
        }
        settled = true;
        router.replace(next);
        return;
      }

      if (searchParams.get("code")) {
        // Give the automatic exchange (triggered by createClient() above)
        // a bounded window to complete and fire the SIGNED_IN listener
        // before concluding the code is genuinely dead.
        await new Promise((resolve) => setTimeout(resolve, 5000));
        if (!settled) {
          settled = true;
          setError("This link has already been used or has expired.");
        }
        return;
      }

      // No code, no token_hash/type, and no hash-fragment tokens at all —
      // most often because the link was already used (each one is
      // single-use; a second click, or an email app pre-opening the link
      // to scan it for safety, both consume it before the real click), or
      // because it's simply past its 1-hour expiry.
      if (!settled) {
        settled = true;
        setError("This link has already been used or has expired.");
      }
    }

    complete();
    return () => subscription.unsubscribe();
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

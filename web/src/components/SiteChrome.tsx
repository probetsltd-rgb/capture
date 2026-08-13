"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Shared by SiteNav and SiteFooter — both were unconditionally showing
// "Sign in" even to a signed-in business owner landing on their own
// /upload/[token] or /report/[token] link, a founder caught this directly.
// Client-side check, not threaded down from a server component: a brief
// flash of the signed-out state before this resolves is an acceptable
// tradeoff for not needing every page that renders these to pass auth state
// through explicitly.
function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(!!session));
    return () => subscription.unsubscribe();
  }, []);

  return signedIn;
}

export function SiteNav() {
  const signedIn = useSignedIn();

  return (
    <header className="nav">
      <div className="shell nav__inner">
        <Link href="/" className="nav__brand">
          Capture
        </Link>

        <nav className="nav__links" aria-label="Primary">
          <Link className="nav__link" href="/#find">
            Find
          </Link>
          <Link className="nav__link" href="/#recover">
            Recover
          </Link>
          <Link className="nav__link" href="/#prevent">
            Prevent
          </Link>
        </nav>

        <div className="nav__actions">
          <Link href={signedIn ? "/dashboard" : "/login"} className="nav__link">
            {signedIn ? "Dashboard" : "Sign in"}
          </Link>
          <Link href="/find" className="btn btn--primary">
            Run a free audit
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const signedIn = useSignedIn();

  return (
    <footer className="footer">
      <div className="shell footer__inner">
        <div>
          <div className="nav__brand">Capture</div>
          <p className="meta" style={{ marginTop: "var(--s1)" }}>
            Turn more demand into revenue.
          </p>
        </div>
        <nav className="footer__links" aria-label="Footer">
          <Link href="/find">Run a free audit</Link>
          <Link href={signedIn ? "/dashboard" : "/login"}>{signedIn ? "Dashboard" : "Sign in"}</Link>
          <Link href="/privacy">Privacy &amp; data handling</Link>
        </nav>
      </div>
    </footer>
  );
}

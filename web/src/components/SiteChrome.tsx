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
          <Link className="nav__link" href="/#how-it-works">
            How it works
          </Link>
          <Link className="nav__link" href="/#find">
            Find
          </Link>
          <Link className="nav__link" href="/#recover">
            Recover
          </Link>
        </nav>

        <div className="nav__actions">
          <Link href={signedIn ? "/dashboard" : "/login"} className="nav__link">
            {signedIn ? "Dashboard" : "Sign in"}
          </Link>
          <Link href="/signup" className="btn btn--primary">
            Try Engage Free
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const signedIn = useSignedIn();
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="shell">
        <div className="footer__grid">
          <div>
            <div className="nav__brand">Capture</div>
            <p className="meta" style={{ marginTop: "var(--s2)", maxWidth: "34ch" }}>
              Capture helps businesses find revenue they&apos;re leaving on the table, recover
              dormant leads, and respond to new enquiries instantly — across WhatsApp and Instagram.
            </p>
          </div>

          <nav className="footer__col" aria-label="Product">
            <div className="footer__col-title">Product</div>
            <Link href="/find">Find</Link>
            <Link href="/#recover">Recover</Link>
            <Link href="/#how-it-works">Engage</Link>
          </nav>

          <nav className="footer__col" aria-label="Account">
            <div className="footer__col-title">Account</div>
            <Link href={signedIn ? "/dashboard" : "/login"}>{signedIn ? "Dashboard" : "Sign in"}</Link>
            <Link href="/signup">Try Engage Free</Link>
          </nav>

          <nav className="footer__col" aria-label="Legal">
            <div className="footer__col-title">Legal</div>
            <Link href="/privacy">Terms &amp; Privacy</Link>
            <Link href="/data-deletion">Data Deletion Instructions</Link>
          </nav>
        </div>

        <div className="footer__bottom">
          <p className="meta">
            &copy; {year} Techvantage Web Assets Ltd. All rights reserved. Capture is a product of
            Techvantage Web Assets Ltd.
          </p>
        </div>
      </div>
    </footer>
  );
}

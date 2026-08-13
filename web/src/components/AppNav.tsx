"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Signed-in surfaces (dashboard, admin, onboarding) previously had no
// header at all — no logo, no way back to the marketing site, no way to
// sign out. A founder caught this directly ("logo should be visible on all
// pages"). Deliberately minimal, distinct from the marketing SiteNav
// (no Find/Recover/Prevent anchors, no "Run a free audit" CTA) — this is
// the app chrome, not the pitch.
export function AppNav() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <header className="nav">
      <div className="shell nav__inner">
        <Link href="/" className="nav__brand">
          Capture
        </Link>
        <div className="nav__actions">
          <Link href="/dashboard" className="nav__link">
            Dashboard
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="nav__link"
            style={{ background: "none", border: 0, cursor: "pointer", font: "inherit" }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}

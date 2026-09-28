"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SiteNav, SiteFooter } from "@/components/SiteChrome";
import { EmailCodeForm } from "@/components/EmailCodeForm";

// A `claim` token (from /report/[token]'s "Create your account" CTA)
// carries through to /onboarding, which does the actual account-linking —
// see onboarding/actions.ts.
const INTENT_COPY: Record<string, { title: string; body: string }> = {
  engage: {
    title: "Start your 14-day Engage trial",
    body: "We'll email you a 6-digit code — no password, no card needed.",
  },
  recover: {
    title: "Get started with Recover",
    body: "We'll email you a 6-digit code. You'll pick a history window and get set up from your dashboard.",
  },
};

function SignupForm() {
  const searchParams = useSearchParams();
  const claim = searchParams.get("claim");
  const intent = searchParams.get("intent");
  const next = claim ? `/onboarding?claim=${encodeURIComponent(claim)}` : "/onboarding";
  const copy = intent ? INTENT_COPY[intent] : undefined;

  return (
    <div className="shell center-page">
      <EmailCodeForm
        next={next}
        title={claim ? "Create your account" : (copy?.title ?? "Create your account")}
        body={
          claim
            ? "Enter the email your audit was sent to and we'll link it to your new account."
            : (copy?.body ?? "We'll email you a 6-digit code. No password to remember.")
        }
      />
      <p className="meta" style={{ marginTop: "var(--s6)" }}>
        Already have an account?{" "}
        <Link href="/login" className="link">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <div className="page">
      <SiteNav />
      <main>
        <Suspense fallback={null}>
          <SignupForm />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}

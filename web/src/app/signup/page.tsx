"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SiteNav, SiteFooter } from "@/components/SiteChrome";
import { requestMagicLink } from "../login/actions";

const initialState = { error: null as string | null, sent: false };

// Reuses /login's requestMagicLink action — any email can already
// authenticate (see that action's comment); this page only differs in copy
// and where it sends the user next. A `claim` token (from /report/[token]'s
// "Create your account" CTA) carries through to /onboarding, which does the
// actual account-linking — see onboarding/actions.ts.
const INTENT_COPY: Record<string, { title: string; body: string }> = {
  engage: {
    title: "Start your 7-day Engage trial",
    body: "We'll email you a link — no password, no card needed.",
  },
  recover: {
    title: "Get started with Recover",
    body: "We'll email you a link. You'll pick a history window and get set up from your dashboard.",
  },
};

function SignupForm() {
  const searchParams = useSearchParams();
  const claim = searchParams.get("claim");
  const intent = searchParams.get("intent");
  const next = claim ? `/onboarding?claim=${encodeURIComponent(claim)}` : "/onboarding";
  const [state, formAction, pending] = useActionState(requestMagicLink, initialState);
  const copy = intent ? INTENT_COPY[intent] : undefined;

  return (
    <div className="shell center-page">
      <h1 className="h2">{claim ? "Create your account" : (copy?.title ?? "Create your account")}</h1>
      <p className="body" style={{ marginTop: "var(--s3)" }}>
        {claim
          ? "Enter the email your audit was sent to and we'll link it to your new account."
          : (copy?.body ?? "We'll email you a link. No password to remember.")}
      </p>

      {state.sent ? (
        <p className="notice notice--ok" style={{ marginTop: "var(--s6)" }}>
          Check your email for a sign-in link.
        </p>
      ) : (
        <form action={formAction} className="form" style={{ marginTop: "var(--s6)" }}>
          <input type="hidden" name="next" value={next} />
          <label className="field">
            <span className="field__label">Email address</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              className="input"
            />
          </label>
          {state.error && <p className="notice notice--error">{state.error}</p>}
          <button type="submit" disabled={pending} className="btn btn--primary btn--block">
            {pending ? "Sending…" : "Send magic link"}
          </button>
        </form>
      )}

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

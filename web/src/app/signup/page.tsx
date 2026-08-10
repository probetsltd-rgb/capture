"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { requestMagicLink } from "../login/actions";

const initialState = { error: null as string | null, sent: false };

// Reuses /login's requestMagicLink action — any email can already
// authenticate (see that action's comment); this page only differs in copy
// and where it sends the user next. A `claim` token (from /report/[token]'s
// "Create your account" CTA) carries through to /onboarding, which does the
// actual account-linking — see onboarding/actions.ts.
function SignupForm() {
  const searchParams = useSearchParams();
  const claim = searchParams.get("claim");
  const next = claim ? `/onboarding?claim=${encodeURIComponent(claim)}` : "/onboarding";
  const [state, formAction, pending] = useActionState(requestMagicLink, initialState);

  return (
    <main style={{ maxWidth: 360, margin: "4rem auto", fontFamily: "sans-serif" }}>
      <h1>Create your Capture account</h1>
      <p>
        {claim
          ? "Enter the email your audit was sent to, and we'll send a sign-in link to link your account."
          : "Enter your email and we'll send a sign-in link — no password needed."}
      </p>
      {state.sent ? (
        <p>Check your email for a sign-in link.</p>
      ) : (
        <form action={formAction}>
          <input type="hidden" name="next" value={next} />
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            style={{ width: "100%", padding: "0.5rem", marginBottom: "0.5rem" }}
          />
          <button type="submit" disabled={pending} style={{ padding: "0.5rem 1rem" }}>
            {pending ? "Sending…" : "Send magic link"}
          </button>
        </form>
      )}
      {state.error && <p style={{ color: "crimson" }}>{state.error}</p>}
      <p style={{ marginTop: "2rem", fontSize: "0.85rem" }}>
        Already have an account? <a href="/login">Sign in</a>
      </p>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

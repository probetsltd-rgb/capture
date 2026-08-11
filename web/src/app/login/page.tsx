"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SiteNav, SiteFooter } from "@/components/SiteChrome";
import { requestMagicLink } from "./actions";

const initialState = { error: null as string | null, sent: false };

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const [state, formAction, pending] = useActionState(requestMagicLink, initialState);

  return (
    <div className="shell center-page">
      <h1 className="h2">Sign in</h1>
      <p className="body" style={{ marginTop: "var(--s3)" }}>
        We&apos;ll email you a link. No password to remember.
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
        New to Capture?{" "}
        <Link href="/signup" className="link">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="page">
      <SiteNav />
      <main>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}

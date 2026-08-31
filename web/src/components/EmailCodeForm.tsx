"use client";

import { useActionState } from "react";
import { requestLoginCode, verifyLoginCode } from "@/app/login/actions";
import { initialRequestCodeState, initialVerifyCodeState } from "@/app/login/state";

// Shared by /login and /signup — a typed 6-digit code, not a clickable
// magic link (see actions.ts for why). Two separate useActionState hooks
// (request, then verify) rather than one, since they're genuinely two
// different server actions with two different payload shapes; `sent`
// on the request state is what switches which form renders.
export function EmailCodeForm({ next, title, body }: { next: string; title: string; body: string }) {
  const [requestState, requestAction, requestPending] = useActionState(
    requestLoginCode,
    initialRequestCodeState,
  );
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyLoginCode,
    initialVerifyCodeState,
  );

  return (
    <>
      <h1 className="h2">{title}</h1>
      <p className="body" style={{ marginTop: "var(--s3)" }}>
        {body}
      </p>

      {!requestState.sent ? (
        <form action={requestAction} className="form" style={{ marginTop: "var(--s6)" }}>
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
          {requestState.error && <p className="notice notice--error">{requestState.error}</p>}
          <button type="submit" disabled={requestPending} className="btn btn--primary btn--block">
            {requestPending ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form action={verifyAction} className="form" style={{ marginTop: "var(--s6)" }}>
          <input type="hidden" name="email" value={requestState.email} />
          <input type="hidden" name="next" value={next} />
          <p className="notice notice--ok">We sent a 6-digit code to {requestState.email}.</p>
          <label className="field">
            <span className="field__label">Enter code</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              name="code"
              required
              maxLength={6}
              placeholder="123456"
              className="input"
              style={{ fontSize: "1.5rem", letterSpacing: "0.3em", textAlign: "center" }}
            />
          </label>
          {verifyState.error && <p className="notice notice--error">{verifyState.error}</p>}
          <button type="submit" disabled={verifyPending} className="btn btn--primary btn--block">
            {verifyPending ? "Verifying…" : "Verify & sign in"}
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--block"
            onClick={() => window.location.reload()}
          >
            Use a different email
          </button>
        </form>
      )}
    </>
  );
}

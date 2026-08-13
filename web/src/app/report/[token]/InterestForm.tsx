"use client";

import Link from "next/link";
import { useActionState } from "react";
import { captureInterest, type InterestState } from "./actions";

const initialState: InterestState = { status: "idle", message: null };

// Self-serve first (PRD's whole premise): someone who just checked "Recover"
// or "Prevent" is at peak intent and should land straight in the product,
// not on a passive "we'll be in touch" — that was a real dead end a founder
// caught in production, since nothing here ever actually reached out. The
// interest flags are still recorded server-side (captureInterest) as an
// admin-visible signal, but the user-facing outcome is now a direct route
// into the account that actually does the thing they just asked for.
export function InterestForm({ token, isSignedIn }: { token: string; isSignedIn: boolean }) {
  const action = captureInterest.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initialState);

  if (state.status === "success") {
    const label = state.wantsRecover && state.wantsPrevent
      ? "Recover and Prevent"
      : state.wantsPrevent
        ? "Prevent"
        : "Recover";
    return (
      <div className="stack">
        <p className="notice notice--ok">Good — let&apos;s get {label} running.</p>
        {isSignedIn ? (
          <Link href="/dashboard" className="btn btn--primary">
            Go to your dashboard →
          </Link>
        ) : (
          <Link href={`/signup?claim=${token}`} className="btn btn--primary">
            Create your free account →
          </Link>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="form">
      <label className="checkbox">
        <input type="checkbox" name="recover" />
        <span>
          <strong style={{ color: "var(--ink)", fontWeight: 500 }}>Recover</strong> — work through
          the opportunities in this report.
        </span>
      </label>
      <label className="checkbox">
        <input type="checkbox" name="prevent" />
        <span>
          <strong style={{ color: "var(--ink)", fontWeight: 500 }}>Prevent</strong> — stop new
          enquiries going cold from here on.
        </span>
      </label>
      {state.status === "error" && <p className="notice notice--error">{state.message}</p>}
      <div>
        <button type="submit" disabled={pending} className="btn btn--primary">
          {pending ? "Sending…" : "I'm interested"}
        </button>
      </div>
    </form>
  );
}

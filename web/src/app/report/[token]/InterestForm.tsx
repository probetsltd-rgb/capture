"use client";

import { useActionState } from "react";
import { captureInterest, type InterestState } from "./actions";

const initialState: InterestState = { status: "idle", message: null };

export function InterestForm({ token }: { token: string }) {
  const action = captureInterest.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initialState);

  if (state.status === "success") {
    return <p className="notice notice--ok">{state.message}</p>;
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

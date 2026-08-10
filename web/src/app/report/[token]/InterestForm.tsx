"use client";

import { useActionState } from "react";
import { captureInterest, type InterestState } from "./actions";

const initialState: InterestState = { status: "idle", message: null };

export function InterestForm({ token }: { token: string }) {
  const action = captureInterest.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initialState);

  if (state.status === "success") {
    return <p>{state.message}</p>;
  }

  return (
    <form action={formAction}>
      <label style={{ display: "block", marginBottom: "0.5rem" }}>
        <input type="checkbox" name="recover" /> Recover — help us re-engage these dormant
        opportunities
      </label>
      <label style={{ display: "block", marginBottom: "0.5rem" }}>
        <input type="checkbox" name="prevent" /> Prevent — stop new enquiries from going cold
        going forward
      </label>
      {state.status === "error" && <p style={{ color: "crimson" }}>{state.message}</p>}
      <button type="submit" disabled={pending} style={{ padding: "0.6rem 1.2rem", marginTop: "0.5rem" }}>
        {pending ? "Sending…" : "I'm interested"}
      </button>
    </form>
  );
}

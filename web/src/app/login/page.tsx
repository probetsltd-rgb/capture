"use client";

import { useActionState } from "react";
import { requestMagicLink } from "./actions";

const initialState = { error: null as string | null, sent: false };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(
    requestMagicLink,
    initialState,
  );

  return (
    <main style={{ maxWidth: 360, margin: "4rem auto", fontFamily: "sans-serif" }}>
      <h1>Capture — Admin sign in</h1>
      <p>Founder/admin access only during Phase 1. Enter your email for a magic sign-in link.</p>
      {state.sent ? (
        <p>Check your email for a sign-in link.</p>
      ) : (
        <form action={formAction}>
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
    </main>
  );
}

"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBusinessAndOnboard, type ActionResult } from "./actions";
import { INDUSTRIES } from "@/app/find/constants";

const initialState: ActionResult = { ok: false, message: "" };

export function OnboardingForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createBusinessAndOnboard, initialState);

  useEffect(() => {
    if (state.ok) router.push("/dashboard");
  }, [state.ok, router]);

  if (state.ok) {
    return <p>Account created — taking you to your dashboard…</p>;
  }

  return (
    <form action={formAction}>
      <label style={{ display: "block", marginBottom: "1rem" }}>
        Business name
        <input
          type="text"
          name="business_name"
          required
          maxLength={200}
          style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
        />
      </label>

      <label style={{ display: "block", marginBottom: "1rem" }}>
        Industry
        <select
          name="industry"
          required
          defaultValue=""
          style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
        >
          <option value="" disabled>
            Select one
          </option>
          {INDUSTRIES.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "block", marginBottom: "1rem" }}>
        Average transaction value (₦, optional)
        <input
          type="number"
          name="avg_transaction_value"
          min={0}
          style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
        />
      </label>

      {!state.ok && state.message && <p style={{ color: "crimson" }}>{state.message}</p>}
      <button type="submit" disabled={pending} style={{ padding: "0.6rem 1.2rem" }}>
        {pending ? "Creating…" : "Create my workspace"}
      </button>
    </form>
  );
}

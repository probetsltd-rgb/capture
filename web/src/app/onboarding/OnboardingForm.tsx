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
      <label className="field">
        Business name
        <input
          type="text"
          name="business_name"
          required
          maxLength={200}
          className="input"
        />
      </label>

      <label className="field">
        Industry
        <select
          name="industry"
          required
          defaultValue=""
          className="input"
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

      <label className="field">
        Average transaction value (₦, optional)
        <input
          type="number"
          name="avg_transaction_value"
          min={0}
          className="input"
        />
      </label>

      <label className="checkbox">
        <input type="checkbox" name="consent" /> I agree to Capture processing my business&apos;s customer
        conversations to identify and recover revenue leakage, as described in the{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">
          privacy policy
        </a>
        .
      </label>

      {!state.ok && state.message && <p className="notice notice--error">{state.message}</p>}
      <button type="submit" disabled={pending} className="btn btn--primary">
        {pending ? "Creating…" : "Create my workspace"}
      </button>
    </form>
  );
}

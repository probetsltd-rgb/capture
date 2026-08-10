"use client";

import { useActionState } from "react";
import { updateRules, type ActionResult } from "../actions";

const initialState: ActionResult = { ok: false, message: "" };

export function RulesForm({
  businessId,
  maxAiFollowups,
  maxRecoverFollowups,
  escalationKeywords,
}: {
  businessId: string;
  maxAiFollowups: number | null;
  maxRecoverFollowups: number | null;
  escalationKeywords: string[];
}) {
  const action = updateRules.bind(null, businessId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction}>
      <label style={{ display: "block", marginBottom: "1rem" }}>
        Max Prevent AI follow-ups
        <input
          type="number"
          name="max_ai_followups"
          min={0}
          defaultValue={maxAiFollowups ?? ""}
          style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
        />
      </label>

      <label style={{ display: "block", marginBottom: "1rem" }}>
        Max Recover follow-up contacts
        <input
          type="number"
          name="max_recover_followups"
          min={0}
          defaultValue={maxRecoverFollowups ?? ""}
          style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
        />
      </label>

      <label style={{ display: "block", marginBottom: "1rem" }}>
        Extra escalation keywords (comma-separated)
        <input
          type="text"
          name="escalation_keywords"
          defaultValue={escalationKeywords.join(", ")}
          placeholder="e.g. fraud, refund, allergy"
          style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
        />
      </label>

      {state.message && <p style={{ color: state.ok ? "#888" : "crimson" }}>{state.message}</p>}
      <button type="submit" disabled={pending} style={{ padding: "0.6rem 1.2rem" }}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

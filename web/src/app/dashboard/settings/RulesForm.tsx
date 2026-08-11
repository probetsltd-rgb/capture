"use client";

import { useActionState } from "react";
import { updateRules, type ActionResult } from "../actions";

const initialState: ActionResult = { ok: false, message: "" };

// No "Max Prevent AI follow-ups" control here on purpose: nothing in the
// codebase schedules proactive AI follow-ups yet, so the setting would
// persist a number that never affects behaviour. Shipping a control that
// silently does nothing is worse than not shipping it. See OUTSTANDINGS.md.
export function RulesForm({
  businessId,
  maxRecoverFollowups,
  escalationKeywords,
  platformMaxRecoverFollowups,
}: {
  businessId: string;
  maxRecoverFollowups: number | null;
  escalationKeywords: string[];
  platformMaxRecoverFollowups: number;
}) {
  const action = updateRules.bind(null, businessId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction}>
      <label style={{ display: "block", marginBottom: "1rem" }}>
        Max Recover follow-up contacts
        <input
          type="number"
          name="max_recover_followups"
          min={0}
          max={platformMaxRecoverFollowups}
          defaultValue={maxRecoverFollowups ?? ""}
          style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
        />
        <span style={{ fontSize: "0.8rem", color: "#666" }}>
          Blank uses the platform default ({platformMaxRecoverFollowups}). You can lower this, but not raise it —
          the cap is a promise to your customers, not a preference.
        </span>
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
        <span style={{ fontSize: "0.8rem", color: "#666" }}>
          Any message containing one of these goes straight to a human, before the AI sees it. Minimum 3 characters
          each. Clearing this field removes all extra keywords.
        </span>
      </label>

      {state.message && <p style={{ color: state.ok ? "#888" : "crimson" }}>{state.message}</p>}
      <button type="submit" disabled={pending} style={{ padding: "0.6rem 1.2rem" }}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

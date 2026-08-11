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
      <label className="field">
        Max Recover follow-up contacts
        <input
          type="number"
          name="max_recover_followups"
          min={0}
          max={platformMaxRecoverFollowups}
          defaultValue={maxRecoverFollowups ?? ""}
          className="input"
        />
        <span className="field__hint">
          Blank uses the platform default ({platformMaxRecoverFollowups}). You can lower this, but not raise it —
          the cap is a promise to your customers, not a preference.
        </span>
      </label>

      <label className="field">
        Extra escalation keywords (comma-separated)
        <input
          type="text"
          name="escalation_keywords"
          defaultValue={escalationKeywords.join(", ")}
          placeholder="e.g. fraud, refund, allergy"
          className="input"
        />
        <span className="field__hint">
          Any message containing one of these goes straight to a human, before the AI sees it. Minimum 3 characters
          each. Clearing this field removes all extra keywords.
        </span>
      </label>

      {state.message && <p className={state.ok ? "notice notice--ok" : "notice notice--error"}>{state.message}</p>}
      <button type="submit" disabled={pending} className="btn btn--primary">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

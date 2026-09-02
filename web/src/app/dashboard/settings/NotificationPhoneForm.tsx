"use client";

import { useActionState } from "react";
import { updateOwnWhatsAppNumber, type ActionResult } from "../actions";

const initialState: ActionResult = { ok: false, message: "" };

// Groundwork for WhatsApp-relay escalations (not live yet — see
// OUTSTANDINGS.md DEP-1). Stored now so the number is already on file
// once sending is possible, rather than adding a new "collect this"
// step later.
export function NotificationPhoneForm({
  businessId,
  currentNumber,
}: {
  businessId: string;
  currentNumber: string | null;
}) {
  const action = updateOwnWhatsAppNumber.bind(null, businessId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="form" style={{ maxWidth: 400 }}>
      <label className="field">
        Your WhatsApp number
        <input
          type="tel"
          name="rawNumber"
          defaultValue={currentNumber ?? ""}
          placeholder="+2348012345678"
          className="input"
        />
        <span className="field__hint">
          Where escalation alerts will reach you once WhatsApp notifications are live. International format,
          e.g. +2348012345678. Leave blank to remove.
        </span>
      </label>
      {state.message && <p className={state.ok ? "notice notice--ok" : "notice notice--error"}>{state.message}</p>}
      <button type="submit" disabled={pending} className="btn btn--primary">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

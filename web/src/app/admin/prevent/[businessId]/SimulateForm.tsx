"use client";

import { useActionState } from "react";
import { simulateInboundMessage, type SimulateResult } from "./actions";

const initialState: SimulateResult = { ok: true, message: "" };

// Stand-in for a live WhatsApp/Instagram webhook (blocked on DEP-1/DEP-2/
// DEP-4 — see OUTSTANDINGS.md). Drives the exact same engine code a real
// webhook handler would call.
export function SimulateForm({ businessId }: { businessId: string }) {
  const action = simulateInboundMessage.bind(null, businessId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 500 }}>
      <input type="text" name="customer_name" placeholder="Customer name (new or existing)" required />
      <textarea name="message" placeholder="Message from the customer" rows={2} required />
      <button type="submit" disabled={pending}>
        {pending ? "Processing…" : "Simulate inbound message"}
      </button>
      {state.message && <p className="meta">{state.message}</p>}
    </form>
  );
}

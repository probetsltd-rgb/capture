"use client";

import { useState, useActionState } from "react";
import { addKnowledgeItemsBulk, type ActionResult } from "./actions";

const initialState: ActionResult = { ok: true, message: "" };

// Collapsed behind a toggle by default — most businesses adding a handful
// of items are better served by the simple one-at-a-time form above; this
// is an opt-in path specifically for a real catalog (several products and
// variants), not the default way to add anything.
export function BulkAddForm({ businessId }: { businessId: string }) {
  const [open, setOpen] = useState(false);
  const action = addKnowledgeItemsBulk.bind(null, businessId);
  const [state, formAction, pending] = useActionState(action, initialState);

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)} style={{ marginTop: "var(--s3)" }}>
        Have several products or a price list? Add multiple at once →
      </button>
    );
  }

  return (
    <form
      action={formAction}
      style={{ margin: "1rem 0", display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 500 }}
    >
      <p className="meta">One item per line — each line becomes its own approved knowledge item.</p>
      <select name="category" required defaultValue="product">
        <option value="product">Product or service (include its price, and a photo/video link if you have one)</option>
        <option value="faq">FAQ</option>
        <option value="policy">Policy</option>
        <option value="delivery">Delivery</option>
        <option value="other">Other</option>
      </select>
      <textarea
        name="items"
        required
        rows={8}
        placeholder={
          "3-seater fabric sofa — ₦450,000 — grey, navy, or beige\n" +
          "2-seater fabric sofa — ₦320,000 — grey or beige\n" +
          "Armchair — ₦150,000 — navy only"
        }
      />
      {!state.ok && state.message && <p className="notice notice--error">{state.message}</p>}
      {state.ok && state.message && <p className="notice">{state.message}</p>}
      <span style={{ display: "inline-flex", gap: "var(--s3)" }}>
        <button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add all"}
        </button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </span>
    </form>
  );
}

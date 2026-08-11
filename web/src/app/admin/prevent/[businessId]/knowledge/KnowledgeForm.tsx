"use client";

import { useActionState } from "react";
import { addKnowledgeItem, type ActionResult } from "./actions";

const initialState: ActionResult = { ok: true, message: "" };

export function KnowledgeForm({ businessId }: { businessId: string }) {
  const action = addKnowledgeItem.bind(null, businessId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} style={{ margin: "1rem 0", display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 500 }}>
      <select name="category" required defaultValue="">
        <option value="" disabled>
          Category
        </option>
        <option value="product">Product</option>
        <option value="price">Price</option>
        <option value="faq">FAQ</option>
        <option value="hours">Hours</option>
        <option value="location">Location</option>
        <option value="policy">Policy</option>
        <option value="delivery">Delivery</option>
        <option value="booking">Booking</option>
        <option value="other">Other</option>
      </select>
      <input type="text" name="question" placeholder="Question this answers (optional, for FAQs)" />
      <textarea name="content" required placeholder="Approved content — exactly what the AI is allowed to say" rows={3} />
      {!state.ok && state.message && <p className="notice notice--error">{state.message}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add knowledge item"}
      </button>
    </form>
  );
}

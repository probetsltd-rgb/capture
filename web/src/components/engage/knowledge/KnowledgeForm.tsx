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
        <option value="product">Product or service (include its price, and a photo/video link if you have one)</option>
        <option value="faq">FAQ</option>
        <option value="hours">Hours</option>
        <option value="location">Location</option>
        <option value="policy">Policy</option>
        <option value="delivery">Delivery</option>
        <option value="booking">Booking</option>
        <option value="other">Other</option>
      </select>
      <input type="text" name="question" placeholder="Question this answers (optional, for FAQs)" />
      <textarea
        name="content"
        required
        placeholder={
          'Approved content — exactly what the AI is allowed to say.\n' +
          'Product example: "3-seater fabric sofa — ₦450,000 — available in grey, navy, or beige."'
        }
        rows={3}
      />
      <div className="field">
        <label className="field__label" htmlFor="media">
          Photo or video (optional) — sent directly in the chat when a customer asks, not a link
        </label>
        <input id="media" type="file" name="media" accept="image/png,image/jpeg,video/mp4,video/quicktime,video/webm,video/ogg,video/avi,video/x-msvideo" />
        <p className="meta">Photos: PNG or JPEG, under 8MB. Videos: MP4, MOV, WebM, OGG, or AVI, under 25MB.</p>
      </div>
      {!state.ok && state.message && <p className="notice notice--error">{state.message}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add knowledge item"}
      </button>
    </form>
  );
}

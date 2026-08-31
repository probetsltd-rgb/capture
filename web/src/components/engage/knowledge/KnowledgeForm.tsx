"use client";

import { useActionState } from "react";
import { addKnowledgeItem, type ActionResult } from "./actions";

const initialState: ActionResult = { ok: true, message: "" };

export function KnowledgeForm({ businessId }: { businessId: string }) {
  const action = addKnowledgeItem.bind(null, businessId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className="panel" style={{ marginTop: "var(--s5)" }}>
      <div className="panel__body">
        <form action={formAction} className="form" style={{ maxWidth: 500 }}>
          <div className="field">
            <label className="field__label" htmlFor="category">
              Category
            </label>
            <select id="category" name="category" required defaultValue="" className="input">
              <option value="" disabled>
                Choose a category
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
          </div>
          <div className="field">
            <label className="field__label" htmlFor="question">
              Question this answers (optional, for FAQs)
            </label>
            <input id="question" type="text" name="question" className="input" />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="content">
              Approved content — exactly what the AI is allowed to say
            </label>
            <textarea
              id="content"
              name="content"
              required
              placeholder='Product example: "3-seater fabric sofa — ₦450,000 — available in grey, navy, or beige."'
              rows={3}
              className="input"
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="media">
              Photo or video (optional) — sent directly in the chat when a customer asks, not a link
            </label>
            <input id="media" type="file" name="media" accept="image/png,image/jpeg,video/mp4,video/quicktime,video/webm,video/ogg,video/avi,video/x-msvideo" />
            <p className="field__hint">Photos: PNG or JPEG, under 8MB. Videos: MP4, MOV, WebM, OGG, or AVI, under 25MB.</p>
          </div>
          {!state.ok && state.message && <p className="notice notice--error">{state.message}</p>}
          <button type="submit" disabled={pending} className="btn btn--primary">
            {pending ? "Saving…" : "Add knowledge item"}
          </button>
        </form>
      </div>
    </div>
  );
}

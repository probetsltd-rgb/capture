"use client";

import { useState, useTransition } from "react";
import { updateKnowledgeItem } from "./actions";

type Item = {
  id: string;
  category: string;
  question: string | null;
  content: string;
  media_url: string | null;
};

const CATEGORY_OPTIONS = ["product", "faq", "hours", "location", "policy", "delivery", "booking", "other"];

// "price" is no longer offered for new items (see actions.ts) but legacy rows
// may still carry it — keep it selectable only for those, so editing one
// doesn't silently force a category change.
export function EditButton({ businessId, item }: { businessId: string; item: Item }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        Edit
      </button>
    );
  }

  const options = CATEGORY_OPTIONS.includes(item.category) ? CATEGORY_OPTIONS : [item.category, ...CATEGORY_OPTIONS];

  return (
    <form
      className="form"
      style={{ display: "block", marginTop: "var(--s3)", maxWidth: 500 }}
      action={(formData) =>
        startTransition(async () => {
          const result = await updateKnowledgeItem(businessId, item.id, formData);
          if (result.ok) {
            setError("");
            setOpen(false);
          } else {
            setError(result.message);
          }
        })
      }
    >
      <div className="field">
        <label className="field__label" htmlFor={`category-${item.id}`}>Category</label>
        <select id={`category-${item.id}`} name="category" defaultValue={item.category} className="input">
          {options.map((c) => (
            <option key={c} value={c} disabled={!CATEGORY_OPTIONS.includes(c)}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`question-${item.id}`}>Question this answers (optional)</label>
        <input id={`question-${item.id}`} type="text" name="question" defaultValue={item.question ?? ""} className="input" />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`content-${item.id}`}>Content</label>
        <textarea id={`content-${item.id}`} name="content" required rows={3} defaultValue={item.content} className="input" />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`media-${item.id}`}>
          {item.media_url ? "Replace photo or video (optional)" : "Photo or video (optional)"}
        </label>
        <input
          id={`media-${item.id}`}
          type="file"
          name="media"
          accept="image/png,image/jpeg,video/mp4,video/quicktime,video/webm,video/ogg,video/avi,video/x-msvideo"
        />
        {item.media_url && (
          <label className="field__hint" style={{ display: "block" }}>
            <input type="checkbox" name="remove_media" /> Remove the attached media
          </label>
        )}
      </div>
      {error && <p className="notice notice--error">{error}</p>}
      <div style={{ display: "inline-flex", gap: "var(--s3)" }}>
        <button type="submit" disabled={pending} className="btn btn--primary">
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={pending}
          className="btn"
          onClick={() => {
            setError("");
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

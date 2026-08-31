"use client";

import { useState, useTransition } from "react";
import { uploadBrochure } from "./actions";

// Collapsed by default, same reasoning as BulkAddForm — this is an opt-in
// path for a business that already has a document, not the default way to
// add knowledge.
export function BrochureUploadForm({ businessId }: { businessId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        className="btn"
        onClick={() => setOpen(true)}
        style={{
          marginTop: "var(--s3)",
          maxWidth: "100%",
          whiteSpace: "normal",
          textAlign: "left",
          height: "auto",
          paddingBlock: "var(--s3)",
        }}
      >
        Have a brochure or price list already? Upload it →
      </button>
    );
  }

  return (
    <div className="panel" style={{ marginTop: "var(--s4)" }}>
      <div className="panel__body">
        <form
          className="form"
          style={{ maxWidth: 500 }}
          action={(formData: FormData) =>
            startTransition(async () => {
              const result = await uploadBrochure(businessId, formData);
              setOk(result.ok);
              setMessage(result.message);
            })
          }
        >
          <p className="meta">
            PDF or plain text. The AI reads it and proposes individual knowledge items — nothing is used until
            you review and approve each one below, same as everything else here.
          </p>
          <input type="file" name="brochure" accept="application/pdf,text/plain" required />
          {message && <p className={ok ? "notice" : "notice notice--error"}>{message}</p>}
          <span style={{ display: "inline-flex", gap: "var(--s3)" }}>
            <button type="submit" disabled={pending} className="btn btn--primary">
              {pending ? "Reading document…" : "Extract knowledge items"}
            </button>
            <button type="button" disabled={pending} onClick={() => setOpen(false)} className="btn">
              Cancel
            </button>
          </span>
        </form>
      </div>
    </div>
  );
}

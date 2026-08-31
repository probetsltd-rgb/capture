"use client";

import { useState, useTransition } from "react";
import { extractKnowledgeFromWebsite } from "./actions";

// Collapsed by default, same reasoning as BrochureUploadForm/BulkAddForm —
// opt-in, not the default way to add knowledge. Especially useful for a
// business with an empty knowledge base (new, or history gone stale
// beyond the 30-day seed window), but shown here unconditionally like the
// brochure upload rather than gated on that state.
export function WebsiteExtractForm({ businessId }: { businessId: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
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
        Have a website? Check it for starting facts →
      </button>
    );
  }

  return (
    <div className="panel" style={{ marginTop: "var(--s4)" }}>
      <div className="panel__body">
        <form
          className="form"
          style={{ maxWidth: 500 }}
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await extractKnowledgeFromWebsite(businessId, url);
              setOk(result.ok);
              setMessage(result.message);
            });
          }}
        >
          <p className="meta">
            Paste your website&apos;s URL. The AI reads the page and proposes individual knowledge items —
            nothing is used until you review and approve each one below, same as everything else here.
          </p>
          <input
            type="url"
            name="url"
            placeholder="https://yourbusiness.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            className="input"
          />
          {message && <p className={ok ? "notice" : "notice notice--error"}>{message}</p>}
          <span style={{ display: "inline-flex", gap: "var(--s3)" }}>
            <button type="submit" disabled={pending} className="btn btn--primary">
              {pending ? "Reading page…" : "Extract knowledge items"}
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

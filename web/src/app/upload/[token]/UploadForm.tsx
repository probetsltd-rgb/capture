"use client";

import { useActionState } from "react";
import Link from "next/link";
import { submitUpload, type UploadState } from "./actions";

const initialState: UploadState = { status: "idle", message: null };

export function UploadForm({ token }: { token: string }) {
  const action = submitUpload.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initialState);

  if (state.status === "success") {
    return (
      <div className="stack">
        <p className="notice notice--ok">{state.message}</p>
        <Link href={`/report/${token}`} className="btn btn--primary">
          View my Revenue Leak Report
        </Link>
        <p className="meta">
          Analysis runs in the background — refresh the report in a moment if it looks incomplete.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="form">
      <label className="field">
        <span className="field__label">
          Average transaction value<span className="field__hint"> · Optional</span>
        </span>
        <input
          type="number"
          name="avg_transaction_value"
          min="0"
          step="1"
          placeholder="e.g. 150000"
          className="input"
        />
        <span className="field__hint">
          Used to estimate what missed opportunities are worth. Only you see it.
        </span>
      </label>

      <label className="field">
        <span className="field__label">Conversation exports</span>
        <input
          type="file"
          name="files"
          accept=".txt,.json"
          multiple
          required
          className="input"
          style={{ height: "auto", paddingBlock: "10px" }}
        />
        <span className="field__hint">
          WhatsApp .txt or Instagram .json files, mixed or separate — up to 5MB each.
        </span>
      </label>

      {state.status === "error" && <p className="notice notice--error">{state.message}</p>}

      <button type="submit" disabled={pending} className="btn btn--primary btn--block">
        {pending ? "Uploading…" : "Upload conversations"}
      </button>
    </form>
  );
}

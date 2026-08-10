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
      <div>
        <p>{state.message}</p>
        <p>
          <Link
            href={`/report/${token}`}
            style={{
              display: "inline-block",
              padding: "0.6rem 1.2rem",
              background: "#111",
              color: "#fff",
              textDecoration: "none",
              borderRadius: "4px",
            }}
          >
            View my Revenue Leak Report
          </Link>
        </p>
        <p style={{ fontSize: "0.85rem", color: "#666" }}>
          Analysis runs in the background — refresh the report page in a moment if it looks incomplete.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <label style={{ display: "block", marginBottom: "1rem" }}>
        <span>Approximate average transaction value (₦, optional)</span>
        <input
          type="number"
          name="avg_transaction_value"
          min="0"
          step="1"
          placeholder="e.g. 150000"
          style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
        />
        <small>Used to estimate the value of missed opportunities in your report — not shown to anyone else.</small>
      </label>
      <input type="file" name="files" accept=".txt" multiple required style={{ display: "block", margin: "1rem 0" }} />
      {state.status === "error" && <p style={{ color: "crimson" }}>{state.message}</p>}
      <button type="submit" disabled={pending} style={{ padding: "0.6rem 1.2rem" }}>
        {pending ? "Uploading…" : "Upload conversations"}
      </button>
    </form>
  );
}

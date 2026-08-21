"use client";

import { useState, useTransition } from "react";
import { deleteInstagramDataAction } from "./actions";

// Unlike DisconnectInstagramButton (reversible — reconnect picks up where
// you left off), this permanently deletes historical data. The confirm
// step spells that out explicitly rather than reusing generic "Confirm"
// copy, since the consequence here is materially different.
export function DeleteInstagramDataButton({ businessId }: { businessId: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return <p className="notice">{message}</p>;
  }

  if (!confirming) {
    return (
      <button className="btn" onClick={() => setConfirming(true)}>
        Delete my Instagram data
      </button>
    );
  }

  return (
    <div className="stack" style={{ display: "flex", flexDirection: "column", gap: "var(--s3)", maxWidth: 480 }}>
      <p className="notice notice--error">
        This permanently deletes every customer, conversation, and message Capture has stored from your
        connected Instagram account, and disconnects it. This cannot be undone — reconnecting afterward
        starts from zero, it does not restore what&apos;s deleted. Your Find and Recover data (if any) is
        not affected.
      </p>
      <span style={{ display: "inline-flex", gap: "var(--s3)", alignItems: "center" }}>
        <button
          disabled={pending}
          className="btn"
          onClick={() =>
            startTransition(async () => {
              const result = await deleteInstagramDataAction(businessId);
              setMessage(result.message);
              if (result.ok) setDone(true);
              else setConfirming(false);
            })
          }
        >
          {pending ? "Deleting…" : "Yes, permanently delete"}
        </button>
        <button disabled={pending} onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </span>
      {message && !done && <p className="notice notice--error">{message}</p>}
    </div>
  );
}

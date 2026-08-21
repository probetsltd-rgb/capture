"use client";

import { useState, useTransition } from "react";
import { resetInstagramConversationHistoryAction } from "./actions";

// Narrower and less consequential than DeleteInstagramDataButton — this
// keeps the Instagram connection alive, so reversibility is different
// (nothing to "undo," but nothing needs reconnecting either).
export function ResetConversationHistoryButton({ businessId }: { businessId: string }) {
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
        Reset conversation history
      </button>
    );
  }

  return (
    <div className="stack" style={{ display: "flex", flexDirection: "column", gap: "var(--s3)", maxWidth: 480 }}>
      <p className="notice notice--error">
        This permanently deletes every customer, conversation, and message currently stored — the
        Instagram connection itself stays live, so nothing needs reconnecting. Note: if you later
        re-trigger a historical fetch, the same real messages will come back from Instagram&apos;s own
        servers, since deleting our copy doesn&apos;t delete them there.
      </p>
      <span style={{ display: "inline-flex", gap: "var(--s3)", alignItems: "center" }}>
        <button
          disabled={pending}
          className="btn"
          onClick={() =>
            startTransition(async () => {
              const result = await resetInstagramConversationHistoryAction(businessId);
              setMessage(result.message);
              if (result.ok) setDone(true);
              else setConfirming(false);
            })
          }
        >
          {pending ? "Resetting…" : "Yes, reset history"}
        </button>
        <button disabled={pending} onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </span>
      {message && !done && <p className="notice notice--error">{message}</p>}
    </div>
  );
}

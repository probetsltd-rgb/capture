"use client";

import { useState, useTransition } from "react";
import { disconnectInstagramAction } from "./actions";

export function DisconnectInstagramButton({ businessId }: { businessId: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button className="btn" onClick={() => setConfirming(true)}>
        Disconnect
      </button>
    );
  }

  return (
    <span className="stack" style={{ display: "inline-flex", gap: "var(--s3)", alignItems: "center" }}>
      <button
        disabled={pending}
        className="btn"
        onClick={() =>
          startTransition(async () => {
            const result = await disconnectInstagramAction(businessId);
            setMessage(result.message);
            if (result.ok) setConfirming(false);
          })
        }
      >
        {pending ? "Disconnecting…" : "Confirm disconnect"}
      </button>
      <button disabled={pending} onClick={() => setConfirming(false)}>
        Cancel
      </button>
      {message && <span className="meta">{message}</span>}
    </span>
  );
}

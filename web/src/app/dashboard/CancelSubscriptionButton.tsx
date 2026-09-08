"use client";

import { useState, useTransition } from "react";
import { cancelSubscription } from "./actions";

// Same confirm-then-submit pattern as ActivateButton/EngagePaywall — a
// billing-cutting action gets the same "are you sure" step as a
// billing-starting one.
export function CancelSubscriptionButton({ businessId }: { businessId: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Founder-caught 2026-09-08: a rare, high-friction action shouldn't
  // visually outweigh "View conversations"/"Manage approved knowledge" —
  // .btn--ghost keeps it discoverable without making it the loudest thing
  // on the panel.
  if (!confirming) {
    return (
      <button className="btn btn--ghost" onClick={() => setConfirming(true)}>
        Cancel subscription
      </button>
    );
  }

  return (
    <div className="stack" style={{ marginTop: "var(--s3)", maxWidth: "52ch" }}>
      <p className="meta">
        This stops Engage immediately — no further charges, but also no automated replies until you
        subscribe again.
      </p>
      <div style={{ display: "flex", gap: "var(--s3)" }}>
        <button
          disabled={pending}
          className="btn btn--primary"
          onClick={() =>
            startTransition(async () => {
              const result = await cancelSubscription(businessId);
              setMessage(result.message);
              if (result.ok) setConfirming(false);
            })
          }
        >
          {pending ? "Canceling…" : "Confirm — cancel subscription"}
        </button>
        <button disabled={pending} onClick={() => setConfirming(false)}>
          Keep subscription
        </button>
      </div>
      {message && <p className="meta">{message}</p>}
    </div>
  );
}

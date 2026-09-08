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

  // Founder-caught 2026-09-08: shouldn't outweigh "View conversations"/
  // "Manage approved knowledge", but .btn--ghost (tried first) went too
  // far the other way — no padding/height at all, so it read as plain
  // text and could be missed entirely. .btn--secondary is still visibly a
  // button without competing with the primary actions above it.
  if (!confirming) {
    return (
      <button className="btn btn--secondary" onClick={() => setConfirming(true)}>
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

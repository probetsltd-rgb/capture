"use client";

import { useState, useTransition } from "react";
import { activateProduct } from "./actions";

// PRD's billing/plan-limits scope is tracking product activation, not
// payment processing (explicit V1 non-goal) — there is no real price to
// show here. Activating was previously a bare button with zero explanation
// of what it actually does, which a founder caught directly ("doesn't give
// enough context"). This states the real mechanics honestly instead of
// inventing pricing that doesn't exist.
const PRODUCT_INFO: Record<"recover" | "prevent", { label: string; explainer: string }> = {
  recover: {
    label: "Recover",
    explainer:
      "Unlocks the campaign manager at /admin/recover — you'll see every opportunity from your report, prioritised, with suggested timing. You send the outreach yourself for now (no automated WhatsApp sending yet); Capture tracks status and enforces the one-follow-up-max limit. No cost during your pilot.",
  },
  prevent: {
    label: "Prevent",
    explainer:
      "Turns on AI responses to new enquiries, answering only from knowledge you've explicitly approved — it will never guess or improvise. Anything outside that knowledge, or anything sensitive, hands off to a human. No cost during your pilot.",
  },
};

export function ActivateButton({ businessId, product }: { businessId: string; product: "recover" | "prevent" }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const info = PRODUCT_INFO[product];

  if (!confirming) {
    return (
      <div style={{ margin: "0.5rem 0" }}>
        <button className="btn btn--primary" onClick={() => setConfirming(true)}>
          Activate {info.label}
        </button>
      </div>
    );
  }

  return (
    <div className="stack" style={{ margin: "0.5rem 0", maxWidth: "52ch" }}>
      <p className="meta">{info.explainer}</p>
      <div style={{ display: "flex", gap: "var(--s3)" }}>
        <button
          disabled={pending}
          className="btn btn--primary"
          onClick={() =>
            startTransition(async () => {
              const result = await activateProduct(businessId, product);
              setMessage(result.message);
              if (result.ok) setConfirming(false);
            })
          }
        >
          {pending ? "Activating…" : `Confirm — activate ${info.label}`}
        </button>
        <button disabled={pending} onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </div>
      {message && <p className="meta">{message}</p>}
    </div>
  );
}

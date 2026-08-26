"use client";

import { useState, useTransition } from "react";
import { startRecoverPurchase } from "@/app/dashboard/recover/actions";

export type RecoverPlanOption = {
  id: string;
  displayName: string;
  priceKobo: number;
  lookbackMonths: number;
};

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

// Mirrors EngagePaywall.tsx's confirm-then-checkout UI, but for a one-time
// purchase, not a recurring plan: no "per month," and every tier here is
// something you own once you've paid for it, not something that lapses.
export function RecoverPaywall({ businessId, plans }: { businessId: string; plans: RecoverPlanOption[] }) {
  const [pending, startTransition] = useTransition();
  const [confirmingPlan, setConfirmingPlan] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="stack" style={{ margin: "0.5rem 0" }}>
      <p className="body">
        Recover ranks every dormant opportunity in your history, times the approach, and stops the
        moment someone replies. You send the outreach yourself for now — no automated WhatsApp
        sending yet. Pick how much history to work through:
      </p>
      <div style={{ display: "flex", gap: "var(--s4)", flexWrap: "wrap" }}>
        {plans.map((plan) => (
          <div
            key={plan.id}
            style={{ padding: "var(--s4)", maxWidth: "28ch", border: "1px solid var(--rule)", borderRadius: "var(--radius)" }}
          >
            <h3 style={{ margin: 0 }}>{plan.displayName}</h3>
            <p className="mono" style={{ fontSize: "1.25rem" }}>
              {formatNaira(plan.priceKobo)}
            </p>
            <ul className="meta" style={{ paddingLeft: "1.2rem" }}>
              <li>Last {plan.lookbackMonths} months of conversation history</li>
              <li>One-time — not a subscription</li>
            </ul>
            {confirmingPlan === plan.id ? (
              <div style={{ display: "flex", gap: "var(--s3)" }}>
                <button
                  disabled={pending}
                  className="btn btn--primary"
                  onClick={() =>
                    startTransition(async () => {
                      const result = await startRecoverPurchase(businessId, plan.id);
                      if (!result.ok) setMessage(result.message);
                    })
                  }
                >
                  {pending ? "Starting checkout…" : "Confirm — go to checkout"}
                </button>
                <button disabled={pending} onClick={() => setConfirmingPlan(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="btn btn--primary" onClick={() => setConfirmingPlan(plan.id)}>
                Get {plan.displayName}
              </button>
            )}
          </div>
        ))}
      </div>
      {message && <p className="meta">{message}</p>}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { startSubscription } from "./actions";

export type PlanOption = {
  id: string;
  displayName: string;
  priceKobo: number;
  messageLimit: number | null;
  escalationNotificationLimit: number;
  hasAnalytics: boolean;
};

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

// Founder request 2026-08-21: pay-to-continue at trial end — no card was
// collected upfront, so this is the point where a lapsed trial (or a
// business choosing to upgrade early) actually starts a real Paystack
// checkout. Mirrors ActivateButton.tsx's confirm-then-submit pattern.
export function EngagePaywall({ businessId, reason, plans }: { businessId: string; reason: string; plans: PlanOption[] }) {
  const [pending, startTransition] = useTransition();
  const [confirmingPlan, setConfirmingPlan] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="stack" style={{ margin: "0.5rem 0" }}>
      <p className="notice notice--error">{reason}</p>
      <div style={{ display: "flex", gap: "var(--s4)", flexWrap: "wrap" }}>
        {plans.map((plan) => (
          <div
            key={plan.id}
            style={{ padding: "var(--s4)", maxWidth: "28ch", border: "1px solid var(--rule)", borderRadius: "var(--radius)" }}
          >
            <h3 style={{ margin: 0 }}>{plan.displayName}</h3>
            <p className="mono" style={{ fontSize: "1.25rem" }}>
              {formatNaira(plan.priceKobo)}/mo
            </p>
            <ul className="meta" style={{ paddingLeft: "1.2rem" }}>
              <li>{plan.messageLimit ? `${plan.messageLimit.toLocaleString()} AI-handled messages/mo` : "Unlimited messages"}</li>
              <li>{plan.escalationNotificationLimit} escalation notification{plan.escalationNotificationLimit === 1 ? "" : "s"}/mo</li>
              <li>Knowledge-base assist (30-day history review)</li>
              {plan.hasAnalytics && <li>Weekly/monthly conversation analytics</li>}
            </ul>
            {confirmingPlan === plan.id ? (
              <div style={{ display: "flex", gap: "var(--s3)" }}>
                <button
                  disabled={pending}
                  className="btn btn--primary"
                  onClick={() =>
                    startTransition(async () => {
                      const result = await startSubscription(businessId, plan.id);
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
                Subscribe to {plan.displayName}
              </button>
            )}
          </div>
        ))}
      </div>
      {message && <p className="meta">{message}</p>}
    </div>
  );
}

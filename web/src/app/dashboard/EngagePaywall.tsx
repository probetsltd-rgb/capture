"use client";

import { useState, useTransition } from "react";
import { startSubscription } from "./actions";

export type PlanOption = {
  id: string;
  displayName: string;
  tier: string;
  billingInterval: "monthly" | "annual";
  priceKobo: number;
  messageLimit: number | null;
  escalationNotificationLimit: number;
  hasAnalytics: boolean;
};

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

type TierGroup = { tier: string; displayName: string; monthly?: PlanOption; annual?: PlanOption };

function groupByTier(plans: PlanOption[]): TierGroup[] {
  const byTier = new Map<string, TierGroup>();
  for (const plan of plans) {
    const entry = byTier.get(plan.tier) ?? { tier: plan.tier, displayName: plan.displayName };
    if (plan.billingInterval === "annual") entry.annual = plan;
    else entry.monthly = plan;
    byTier.set(plan.tier, entry);
  }
  return Array.from(byTier.values());
}

// Founder request 2026-08-21: pay-to-continue at trial end — no card was
// collected upfront, so this is the point where a lapsed trial (or a
// business choosing to upgrade early) actually starts a real Paystack
// checkout. Mirrors ActivateButton.tsx's confirm-then-submit pattern.
//
// Founder decision 2026-09-03: added annual billing alongside monthly —
// exactly 2 duration options, deliberately not 3. Grouped by tier here
// (one card per tier, a Monthly/Annual toggle within it) rather than a
// separate card per plan row, so 4 underlying plan rows still read as
// "2 tiers, pick a duration" instead of 4 competing choices.
export function EngagePaywall({ businessId, reason, plans }: { businessId: string; reason: string; plans: PlanOption[] }) {
  const [pending, startTransition] = useTransition();
  const [confirmingPlan, setConfirmingPlan] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [intervalByTier, setIntervalByTier] = useState<Record<string, "monthly" | "annual">>({});

  const tiers = groupByTier(plans);

  return (
    <div className="stack" style={{ margin: "0.5rem 0" }}>
      <p className="notice notice--error">{reason}</p>
      <div style={{ display: "flex", gap: "var(--s4)", flexWrap: "wrap" }}>
        {tiers.map((t) => {
          const interval = intervalByTier[t.tier] ?? "monthly";
          const plan = interval === "annual" ? t.annual : t.monthly;
          if (!plan) return null;
          const savings = t.monthly && t.annual ? t.monthly.priceKobo * 12 - t.annual.priceKobo : 0;

          return (
            <div
              key={t.tier}
              style={{ padding: "var(--s4)", maxWidth: "28ch", border: "1px solid var(--rule)", borderRadius: "var(--radius)" }}
            >
              <h3 style={{ margin: 0 }}>{t.displayName}</h3>

              {t.monthly && t.annual && (
                <div style={{ display: "inline-flex", gap: "var(--s2)", marginTop: "var(--s3)" }}>
                  <button
                    type="button"
                    className={interval === "monthly" ? "btn btn--primary" : "btn"}
                    onClick={() => setIntervalByTier((s) => ({ ...s, [t.tier]: "monthly" }))}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    className={interval === "annual" ? "btn btn--primary" : "btn"}
                    onClick={() => setIntervalByTier((s) => ({ ...s, [t.tier]: "annual" }))}
                  >
                    Annual
                  </button>
                </div>
              )}

              <p className="mono" style={{ fontSize: "1.25rem", marginTop: "var(--s3)" }}>
                {formatNaira(plan.priceKobo)}
                <span className="meta" style={{ fontWeight: 400 }}>/{interval === "annual" ? "yr" : "mo"}</span>
              </p>
              {interval === "annual" && savings > 0 && (
                <p className="meta">Save {formatNaira(savings)}/yr — about 2 months free vs. monthly.</p>
              )}

              <ul className="meta" style={{ paddingLeft: "1.2rem" }}>
                <li>{plan.messageLimit ? `${plan.messageLimit.toLocaleString()} customer messages handled/mo` : "Unlimited messages"}</li>
                <li>
                  {plan.escalationNotificationLimit === 1
                    ? "Escalations go to 1 team member"
                    : `Escalations reach up to ${plan.escalationNotificationLimit} team members`}
                </li>
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
                  Subscribe to {t.displayName} ({interval})
                </button>
              )}
            </div>
          );
        })}
      </div>
      {message && <p className="meta">{message}</p>}
    </div>
  );
}

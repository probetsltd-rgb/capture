"use client";

import { useState, useTransition } from "react";
import { updatePlan } from "./actions";

export type PlanRow = {
  id: string;
  displayName: string;
  priceKobo: number;
  messageLimit: number | null;
  escalationNotificationLimit: number;
  hasAnalytics: boolean;
  paystackPlanCode: string | null;
};

export function PlanEditForm({ plan }: { plan: PlanRow }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [priceNaira, setPriceNaira] = useState(String(plan.priceKobo / 100));
  const [messageLimit, setMessageLimit] = useState(plan.messageLimit === null ? "" : String(plan.messageLimit));
  const [escalationLimit, setEscalationLimit] = useState(String(plan.escalationNotificationLimit));
  const [hasAnalytics, setHasAnalytics] = useState(plan.hasAnalytics);
  const [paystackPlanCode, setPaystackPlanCode] = useState(plan.paystackPlanCode ?? "");

  return (
    <div className="stack" style={{ border: "1px solid var(--rule)", borderRadius: "var(--radius)", padding: "var(--s4)" }}>
      <h3 style={{ margin: 0 }}>{plan.displayName}</h3>
      <label>
        Price (₦/month)
        <input type="number" min="0" value={priceNaira} onChange={(e) => setPriceNaira(e.target.value)} />
      </label>
      <label>
        Message limit/month (blank = unlimited)
        <input type="number" min="0" value={messageLimit} onChange={(e) => setMessageLimit(e.target.value)} />
      </label>
      <label>
        Escalation notifications/month
        <input type="number" min="0" value={escalationLimit} onChange={(e) => setEscalationLimit(e.target.value)} />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
        <input type="checkbox" checked={hasAnalytics} onChange={(e) => setHasAnalytics(e.target.checked)} />
        Conversation analytics included
      </label>
      <label>
        Paystack plan code
        <input
          type="text"
          value={paystackPlanCode}
          onChange={(e) => setPaystackPlanCode(e.target.value)}
          placeholder="PLN_xxxxxxxx"
        />
      </label>
      <p className="meta">
        Required before Subscribe can work for this tier — create the matching Plan in the Paystack dashboard first.
        Once linked, saving a new price here also updates that Paystack Plan's amount automatically, so the price shown
        here and the price actually charged always match. Existing subscribers keep their current rate; only new
        subscriptions use the updated price.
      </p>
      <button
        className="btn btn--primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await updatePlan(plan.id, {
              priceKobo: Math.round(Number(priceNaira) * 100),
              messageLimit: messageLimit === "" ? null : Number(messageLimit),
              escalationNotificationLimit: Number(escalationLimit),
              hasAnalytics,
              paystackPlanCode: paystackPlanCode.trim() || null,
            });
            setMessage(result.message);
          })
        }
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {message && <p className="meta">{message}</p>}
    </div>
  );
}

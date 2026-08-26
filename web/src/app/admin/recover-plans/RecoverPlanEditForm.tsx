"use client";

import { useState, useTransition } from "react";
import { updateRecoverPlan } from "./actions";

export type RecoverPlanRow = {
  id: string;
  displayName: string;
  priceKobo: number;
  lookbackMonths: number;
};

export function RecoverPlanEditForm({ plan }: { plan: RecoverPlanRow }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [priceNaira, setPriceNaira] = useState(String(plan.priceKobo / 100));
  const [lookbackMonths, setLookbackMonths] = useState(String(plan.lookbackMonths));

  return (
    <div className="stack" style={{ border: "1px solid var(--rule)", borderRadius: "var(--radius)", padding: "var(--s4)" }}>
      <h3 style={{ margin: 0 }}>{plan.displayName}</h3>
      <label>
        Price (₦, one-time)
        <input type="number" min="0" value={priceNaira} onChange={(e) => setPriceNaira(e.target.value)} />
      </label>
      <label>
        History window (months)
        <input type="number" min="1" value={lookbackMonths} onChange={(e) => setLookbackMonths(e.target.value)} />
      </label>
      <p className="meta">
        Takes effect on the next checkout — no Paystack-side object to keep in sync for a one-time charge. A price/window
        edit here never changes what an existing customer already paid for (their purchase keeps the window they bought).
      </p>
      <button
        className="btn btn--primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await updateRecoverPlan(plan.id, {
              priceKobo: Math.round(Number(priceNaira) * 100),
              lookbackMonths: Number(lookbackMonths),
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

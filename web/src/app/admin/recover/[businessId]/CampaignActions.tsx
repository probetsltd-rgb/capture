"use client";

import { useState, useTransition } from "react";
import { markContacted, markResponded, recordOutcome } from "./actions";

export function CampaignActions({
  opportunityId,
  businessId,
  status,
  hasPendingAutomation,
}: {
  opportunityId: string;
  businessId: string;
  status: string;
  hasPendingAutomation: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [revenue, setRevenue] = useState("");

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.message);
    });
  }

  if (status === "won" || status === "lost" || status === "not_sure") {
    return <span style={{ color: "#888" }}>{status}</span>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.85rem" }}>
      {status === "identified" && hasPendingAutomation && (
        <button disabled={pending} onClick={() => run(() => markContacted(opportunityId, businessId))}>
          Mark contacted
        </button>
      )}
      {status === "identified" && !hasPendingAutomation && (
        <span style={{ color: "#888" }}>Not yet queued — start a campaign</span>
      )}
      {status === "contacted" && (
        <>
          <button disabled={pending} onClick={() => run(() => markContacted(opportunityId, businessId))}>
            Log follow-up
          </button>
          <button disabled={pending} onClick={() => run(() => markResponded(opportunityId, businessId))}>
            Mark responded
          </button>
        </>
      )}
      {status === "responded" && (
        <>
          <input
            type="number"
            placeholder="Revenue if won"
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
            style={{ width: "100px" }}
          />
          <div style={{ display: "flex", gap: "0.25rem" }}>
            <button
              disabled={pending}
              onClick={() => run(() => recordOutcome(opportunityId, businessId, "won", Number(revenue) || null))}
            >
              Won
            </button>
            <button disabled={pending} onClick={() => run(() => recordOutcome(opportunityId, businessId, "lost", null))}>
              Lost
            </button>
            <button
              disabled={pending}
              onClick={() => run(() => recordOutcome(opportunityId, businessId, "not_sure", null))}
            >
              Not sure
            </button>
          </div>
        </>
      )}
      {message && <span style={{ color: "#888" }}>{message}</span>}
    </div>
  );
}

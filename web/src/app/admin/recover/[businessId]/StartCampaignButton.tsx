"use client";

import { useState, useTransition } from "react";
import { startCampaign } from "./actions";

export function StartCampaignButton({ businessId }: { businessId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div style={{ margin: "1rem 0" }}>
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await startCampaign(businessId);
            setMessage(result.message);
          })
        }
      >
        {pending ? "Queuing…" : "Start recovery campaign"}
      </button>
      {message && <p style={{ color: "#888", fontSize: "0.9rem" }}>{message}</p>}
    </div>
  );
}

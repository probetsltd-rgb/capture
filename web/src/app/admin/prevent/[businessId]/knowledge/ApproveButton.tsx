"use client";

import { useState, useTransition } from "react";
import { approveKnowledgeItem } from "./actions";

export function ApproveButton({ businessId, itemId }: { businessId: string; itemId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await approveKnowledgeItem(businessId, itemId);
            setError(result.ok ? null : result.message);
          })
        }
        style={{ fontSize: "0.8rem" }}
      >
        {pending ? "Approving…" : "Approve"}
      </button>
      {error && <span style={{ color: "crimson", fontSize: "0.8rem" }}> {error}</span>}
    </>
  );
}

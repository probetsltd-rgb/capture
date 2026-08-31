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
        className="btn btn--primary"
        onClick={() =>
          startTransition(async () => {
            const result = await approveKnowledgeItem(businessId, itemId);
            setError(result.ok ? null : result.message);
          })
        }
      >
        {pending ? "Approving…" : "Approve"}
      </button>
      {error && <span className="meta" style={{ color: "#8c2f2f" }}> {error}</span>}
    </>
  );
}

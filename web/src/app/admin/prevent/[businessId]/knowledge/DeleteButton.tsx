"use client";

import { useTransition } from "react";
import { deleteKnowledgeItem } from "./actions";

export function DeleteButton({ businessId, itemId }: { businessId: string; itemId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await deleteKnowledgeItem(businessId, itemId);
        })
      }
      style={{ fontSize: "0.8rem" }}
    >
      Delete
    </button>
  );
}

"use client";

import { useState, useTransition } from "react";
import { activateProduct } from "./actions";

export function ActivateButton({ businessId, product }: { businessId: string; product: "recover" | "prevent" }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div style={{ margin: "0.5rem 0" }}>
      <button
        disabled={pending}
        style={{ padding: "0.5rem 1rem" }}
        onClick={() =>
          startTransition(async () => {
            const result = await activateProduct(businessId, product);
            setMessage(result.message);
          })
        }
      >
        {pending ? "Activating…" : `Activate ${product === "recover" ? "Recover" : "Prevent"}`}
      </button>
      {message && <p style={{ color: "#888", fontSize: "0.85rem" }}>{message}</p>}
    </div>
  );
}

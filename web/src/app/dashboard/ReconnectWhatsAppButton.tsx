"use client";

import { useState, useTransition } from "react";
import { reconnectWhatsAppAction } from "./actions";

export function ReconnectWhatsAppButton({ businessId }: { businessId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <span style={{ display: "inline-flex", gap: "var(--s3)", alignItems: "center" }}>
      <button
        className="btn btn--primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await reconnectWhatsAppAction(businessId);
            setMessage(result.message);
            if (result.ok) window.location.reload();
          })
        }
      >
        {pending ? "Reconnecting…" : "Reconnect"}
      </button>
      {message && <span className="meta">{message}</span>}
    </span>
  );
}

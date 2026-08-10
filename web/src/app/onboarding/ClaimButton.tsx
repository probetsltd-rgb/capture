"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimBusiness } from "./actions";

export function ClaimButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div style={{ margin: "1rem 0" }}>
      <button
        disabled={pending}
        style={{ padding: "0.6rem 1.2rem" }}
        onClick={() =>
          startTransition(async () => {
            const result = await claimBusiness(token);
            if (result.ok) {
              router.push("/dashboard");
              return;
            }
            setMessage(result.message);
          })
        }
      >
        {pending ? "Linking…" : "Claim this business"}
      </button>
      {message && <p style={{ color: "crimson" }}>{message}</p>}
    </div>
  );
}

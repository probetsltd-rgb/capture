"use client";

import { useState, useTransition } from "react";
import { updateTrialDays } from "./actions";

export function TrialDaysForm({ trialDays }: { trialDays: number }) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(String(trialDays));
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="stack" style={{ maxWidth: "40ch" }}>
      <label>
        Trial length (days)
        <input type="number" min="1" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button
        className="btn btn--primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await updateTrialDays(Number(value));
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

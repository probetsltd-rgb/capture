"use client";

import { useState, useTransition } from "react";
import { setKnowledgeBaseComplete } from "./actions";

// Founder-caught 2026-08-21: without this, the response engine has no way
// to know whether a gap in the approved knowledge means "we don't offer
// that" or "we just haven't entered it yet" — and defaulting to the safer
// assumption (partial catalog, escalate unlisted requests) means a
// business with a genuinely complete catalog gets more escalations than
// necessary. This is the explicit signal that changes the default.
export function CompletenessToggle({
  businessId,
  confirmedCompleteAt,
}: {
  businessId: string;
  confirmedCompleteAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const toggle = (complete: boolean) =>
    startTransition(async () => {
      const result = await setKnowledgeBaseComplete(businessId, complete);
      setMessage(result.message);
    });

  return (
    <div className="notice" style={{ margin: "1rem 0" }}>
      {confirmedCompleteAt ? (
        <>
          <p style={{ margin: 0 }}>
            Marked complete on {new Date(confirmedCompleteAt).toLocaleDateString()}. The AI can confidently
            say something isn&apos;t offered instead of always escalating.
          </p>
          <p className="meta" style={{ marginTop: "var(--s2)" }}>
            Added new products or services since? Unmark this so the AI checks with your team about
            anything not yet listed, rather than assuming you still don&apos;t offer it.
          </p>
          <button disabled={pending} onClick={() => toggle(false)}>
            {pending ? "Saving…" : "Unmark as complete"}
          </button>
        </>
      ) : (
        <>
          <p style={{ margin: 0 }}>
            Is this everything you offer? By default the AI treats this list as a work in progress — if a
            customer asks about something that isn&apos;t listed, it escalates to your team rather than
            saying you don&apos;t have it (a knowledge base built up over time shouldn&apos;t cost you a
            sale on something you actually offer).
          </p>
          <button disabled={pending} onClick={() => toggle(true)} style={{ marginTop: "var(--s2)" }}>
            {pending ? "Saving…" : "Mark my knowledge base as complete"}
          </button>
        </>
      )}
      {message && <p className="meta">{message}</p>}
    </div>
  );
}

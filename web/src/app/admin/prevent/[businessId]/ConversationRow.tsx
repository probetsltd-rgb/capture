"use client";

import { useState, useTransition } from "react";
import { markTakeConversation, closeConversation } from "./actions";

export function ConversationRow({
  businessId,
  conversationId,
  state,
  escalationReason,
  assignedTo,
}: {
  businessId: string;
  conversationId: string;
  state: string;
  escalationReason: string | null;
  assignedTo: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [assignee, setAssignee] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  if (state === "human_handling") {
    return <span className="meta">Taken by {assignedTo}</span>;
  }
  if (state === "closed") {
    return <span className="meta">Closed</span>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      {escalationReason && <span style={{ fontSize: "0.8rem", color: "#c66" }}>Escalated: {escalationReason}</span>}
      <div style={{ display: "flex", gap: "0.25rem" }}>
        <input
          type="text"
          placeholder="Your name"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          style={{ width: "90px" }}
        />
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await markTakeConversation(businessId, conversationId, assignee);
              setMessage(result.message);
            })
          }
        >
          Take conversation
        </button>
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await closeConversation(businessId, conversationId);
              setMessage(result.message);
            })
          }
        >
          Close
        </button>
      </div>
      {message && <span className="meta">{message}</span>}
    </div>
  );
}

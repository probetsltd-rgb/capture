"use client";

import { useState, useTransition } from "react";
import { markTakeConversation, closeConversation } from "./actions";

type MessageForThread = { sender_type: string; body: string | null; sent_at: string };

const SENDER_LABEL: Record<string, string> = {
  customer: "Customer",
  ai: "AI",
  business: "Team",
  system: "System",
};

// Founder-caught 2026-08-15, filed then, fixed now: this row showed the
// escalation reason but never what the customer actually said — a real,
// previously-open gap (OUTSTANDINGS.md "Escalation Row Missing Message
// Content"). The thread toggle below is available in every state (active,
// taken, closed), not just the escalate/respond case the row used to
// short-circuit on, since seeing history matters for a closed or
// already-taken conversation too, not only an active one.
function MessageThread({ messages }: { messages: MessageForThread[] }) {
  const [open, setOpen] = useState(false);

  if (messages.length === 0) {
    return <span className="meta">No messages yet.</span>;
  }

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        View messages ({messages.length})
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 480 }}>
      <button type="button" onClick={() => setOpen(false)}>
        Hide messages
      </button>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.375rem",
          maxHeight: 280,
          overflowY: "auto",
          border: "1px solid var(--rule)",
          borderRadius: 4,
          padding: "0.5rem",
        }}
      >
        {messages.map((m, i) => (
          <div key={i} style={{ fontSize: "0.8125rem" }}>
            <strong>{SENDER_LABEL[m.sender_type] ?? m.sender_type}:</strong>{" "}
            {m.body ?? <em className="meta">(no text)</em>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ConversationRow({
  businessId,
  conversationId,
  state,
  escalationReason,
  assignedTo,
  messages,
}: {
  businessId: string;
  conversationId: string;
  state: string;
  escalationReason: string | null;
  assignedTo: string | null;
  messages: MessageForThread[];
}) {
  const [pending, startTransition] = useTransition();
  const [assignee, setAssignee] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  if (state === "human_handling") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        <span className="meta">Taken by {assignedTo}</span>
        <MessageThread messages={messages} />
      </div>
    );
  }
  if (state === "closed") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        <span className="meta">Closed</span>
        <MessageThread messages={messages} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      {escalationReason && <span style={{ fontSize: "0.8rem", color: "#c66" }}>Escalated: {escalationReason}</span>}
      <MessageThread messages={messages} />
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

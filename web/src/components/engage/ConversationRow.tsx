"use client";

import { useEffect, useState, useTransition } from "react";
import { markTakeConversation, closeConversation, sendConversationReply, getConversationMessages } from "./actions";

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
//
// Founder-reported 2026-09-07: with a thread open, a customer's new
// message never appeared without reloading the whole page — this only
// ever rendered the `messages` prop EngageDashboardView fetched once at
// page load. Polls for fresh messages every 5s while open (stops the
// moment it's collapsed again) rather than adding a Realtime subscription
// nothing else in this codebase uses yet — see getConversationMessages in
// ./actions for the fuller reasoning.
function MessageThread({
  businessId,
  conversationId,
  messages: initialMessages,
}: {
  businessId: string;
  conversationId: string;
  messages: MessageForThread[];
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(initialMessages);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const poll = async () => {
      const fresh = await getConversationMessages(businessId, conversationId);
      if (!cancelled && fresh.length > 0) setMessages(fresh);
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, businessId, conversationId]);

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

// The actual "talk to the customer" action — added alongside Take
// Conversation, which previously only stopped the AI without giving a
// human any way to reply from inside Capture at all. Only shown once a
// conversation is taken (human_handling), same reasoning as requiring
// Take first everywhere else in this component: makes ownership explicit
// so two team members can't reply to the same customer at once.
function ReplyForm({ businessId, conversationId }: { businessId: string; conversationId: string }) {
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="field" style={{ marginTop: "var(--s2)" }}>
      <textarea
        className="input"
        placeholder="Reply to the customer…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={pending}
        rows={2}
        style={{ maxWidth: 420 }}
      />
      <button
        type="button"
        className="btn btn--primary"
        disabled={pending || !text.trim()}
        style={{ alignSelf: "flex-start" }}
        onClick={() =>
          startTransition(async () => {
            const r = await sendConversationReply(businessId, conversationId, text);
            setResult(r);
            if (r.ok) setText("");
          })
        }
      >
        {pending ? "Sending…" : "Send reply"}
      </button>
      {result && (
        <span className={result.ok ? "meta" : "notice notice--error"}>{result.message}</span>
      )}
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
  const [message, setMessage] = useState<string | null>(null);

  if (state === "human_handling") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        <span className="meta">Taken by {assignedTo}</span>
        <MessageThread businessId={businessId} conversationId={conversationId} messages={messages} />
        <ReplyForm businessId={businessId} conversationId={conversationId} />
      </div>
    );
  }
  if (state === "closed") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        <span className="meta">Closed</span>
        <MessageThread businessId={businessId} conversationId={conversationId} messages={messages} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      {escalationReason && <span style={{ fontSize: "0.8rem", color: "#c66" }}>Escalated: {escalationReason}</span>}
      <MessageThread businessId={businessId} conversationId={conversationId} messages={messages} />
      <div style={{ display: "flex", gap: "0.25rem" }}>
        <button
          className="btn btn--primary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await markTakeConversation(businessId, conversationId);
              setMessage(result.message);
            })
          }
        >
          Take conversation
        </button>
        <button
          className="btn"
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

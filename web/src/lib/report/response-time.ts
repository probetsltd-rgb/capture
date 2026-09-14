import "server-only";

// Founder request 2026-09-08 (tracked as an open want since 2026-08-15,
// PRD Addendum §18's own Day-5 example: "Response time: 47 min → 38 sec")
// — real average/fastest/slowest first-response time, computed the way
// the addendum describes: per conversation, the delta between the
// customer's first message and the first reply (ai or business) after it.
// Pure function over already-fetched messages, same "no DB access, cheap
// to test" discipline as generateRevenueLeakReport — and the same
// never-fabricate rule as the rest of that report: returns null (never a
// zero or a guess) when there's no conversation with both a customer
// message and a reply yet.

export type MessageForResponseTime = { conversation_id: string; sender_type: string; sent_at: string };

export type ResponseTimeStats = {
  averageSeconds: number;
  minSeconds: number;
  maxSeconds: number;
  sampleSize: number;
};

export function computeResponseTimeStats(messages: MessageForResponseTime[]): ResponseTimeStats | null {
  const byConversation = new Map<string, MessageForResponseTime[]>();
  for (const m of messages) {
    const list = byConversation.get(m.conversation_id) ?? [];
    list.push(m);
    byConversation.set(m.conversation_id, list);
  }

  const responseTimesSeconds: number[] = [];
  for (const convMessages of byConversation.values()) {
    const sorted = [...convMessages].sort(
      (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime(),
    );
    const firstCustomerMessage = sorted.find((m) => m.sender_type === "customer");
    if (!firstCustomerMessage) continue;
    const firstCustomerTime = new Date(firstCustomerMessage.sent_at).getTime();

    // First actual reply after that message — "ai" or "business", never
    // "system" (historically the resume-after-silence marker; DEV-46
    // removed that code path 2026-09-14, but old rows using it still exist
    // — this exclusion still matters for them, and costs nothing to keep
    // even once none remain) — whichever comes first, matching how a
    // customer experiences response time regardless of who or what
    // answered.
    const firstReply = sorted.find(
      (m) =>
        (m.sender_type === "ai" || m.sender_type === "business") &&
        new Date(m.sent_at).getTime() >= firstCustomerTime,
    );
    if (!firstReply) continue;

    const deltaSeconds = (new Date(firstReply.sent_at).getTime() - firstCustomerTime) / 1000;
    if (deltaSeconds >= 0) responseTimesSeconds.push(deltaSeconds);
  }

  if (responseTimesSeconds.length === 0) return null;
  return {
    averageSeconds: responseTimesSeconds.reduce((sum, s) => sum + s, 0) / responseTimesSeconds.length,
    minSeconds: Math.min(...responseTimesSeconds),
    maxSeconds: Math.max(...responseTimesSeconds),
    sampleSize: responseTimesSeconds.length,
  };
}

// Matches the homepage demo's own style ("47 min", "38 sec") — whole
// seconds/minutes/hours, never a decimal, since sub-second precision on a
// human-facing duration reads as noise, not accuracy.
export function formatResponseDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return `${hours.toFixed(1)} hr`;
}

// PRD §24 controlled follow-up — same one-further-follow-up discipline as
// Recover's MAX_AUTOMATIONS_PER_OPPORTUNITY (web/src/lib/recover/rules.ts).
// Overridable per business via businesses.max_ai_followups (Phase 4
// "Configure Rules") — no live caller sets a follow-up yet (OUTSTANDINGS.md),
// so the override plumbing here is ahead of a real call site, kept
// consistent with Recover's equivalent rather than left to drift.
export const MAX_AI_FOLLOWUPS = 2;
export function canSendFollowup(currentCount: number, max: number = MAX_AI_FOLLOWUPS): boolean {
  return currentCount < max;
}

// PRD §22 escalation timers — pure logic, separate from the Cron route
// that calls it, so the timing rules are testable without waiting real
// minutes or needing a live cron trigger.

export const T10_MINUTES = 10;
export const T30_MINUTES = 30;

export type ConversationForTimers = {
  id: string;
  escalated_at: string | null;
  human_taken_at: string | null;
  t10_reminder_sent_at: string | null;
  t30_escalated_at: string | null;
};

export type TimerAction = { conversationId: string; action: "t10_reminder" | "t30_manager_escalation" };

/**
 * Given the set of currently-escalated, not-yet-taken conversations,
 * return which ones just crossed the T+10 or T+30 threshold and haven't
 * already had that specific timer fire. A conversation can produce both
 * actions in one pass if it's overdue on both (e.g. cron didn't run for a
 * while) — callers should still only notify once per action, which the
 * *_sent_at / *_escalated_at columns enforce (this function is pure and
 * doesn't check "already notified" beyond what's in the input row).
 */
export function computeDueTimerActions(
  conversations: ConversationForTimers[],
  now: Date = new Date(),
): TimerAction[] {
  const actions: TimerAction[] = [];
  for (const conv of conversations) {
    if (conv.human_taken_at || !conv.escalated_at) continue; // human already acted, or not actually escalated
    const minutesSinceEscalation = (now.getTime() - new Date(conv.escalated_at).getTime()) / 60000;

    if (minutesSinceEscalation >= T10_MINUTES && !conv.t10_reminder_sent_at) {
      actions.push({ conversationId: conv.id, action: "t10_reminder" });
    }
    if (minutesSinceEscalation >= T30_MINUTES && !conv.t30_escalated_at) {
      actions.push({ conversationId: conv.id, action: "t30_manager_escalation" });
    }
  }
  return actions;
}

// PRD §24's controlled-follow-up cap previously lived here as
// MAX_AI_FOLLOWUPS/canSendFollowup(). Removed: nothing ever called it.
// There is no proactive AI-follow-up scheduler in the codebase, so the
// function guarded a feature that does not exist while a settings control
// invited businesses to tune it — a number that looked like a safety
// setting and changed nothing. The conversations.ai_followup_count column
// and businesses.max_ai_followups remain (the dashboard reports the former;
// vertical templates seed the latter) so the cap can be reinstated at a
// real call site when the scheduler is actually built. See OUTSTANDINGS.md.

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

// Founder decision 2026-09-07: after a team takes a conversation
// (human_handling), if the customer's most recent message has gone this
// many minutes without a team reply, Engage resumes rather than leaving it
// stuck on a team member who's gone quiet. Matches the existing T+10
// reminder threshold above rather than inventing a separate number — see
// lib/prevent/process.ts's resumeSilentConversation for the actual resume,
// and api/cron/resume-after-silence for what calls this.
export const RESUME_AFTER_SILENCE_MINUTES = 10;

export type ConversationForResume = {
  id: string;
  latestMessageSenderType: string | null;
  latestMessageSentAt: string | null;
};

/**
 * Given human_handling conversations paired with their latest message,
 * return the ids whose latest message is from the customer and has sat
 * unanswered for RESUME_AFTER_SILENCE_MINUTES+. Pure so the threshold is
 * testable without a live cron trigger, same reasoning as
 * computeDueTimerActions above.
 */
export function computeConversationsToResume(
  conversations: ConversationForResume[],
  now: Date = new Date(),
): string[] {
  const ids: string[] = [];
  for (const conv of conversations) {
    if (conv.latestMessageSenderType !== "customer" || !conv.latestMessageSentAt) continue;
    const minutesSinceLastMessage = (now.getTime() - new Date(conv.latestMessageSentAt).getTime()) / 60000;
    if (minutesSinceLastMessage >= RESUME_AFTER_SILENCE_MINUTES) ids.push(conv.id);
  }
  return ids;
}

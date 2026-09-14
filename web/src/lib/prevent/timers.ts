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

// Founder decision 2026-09-14: supersedes the 2026-09-07 "resume after
// silence" behavior below (formerly RESUME_AFTER_SILENCE_MINUTES /
// computeConversationsToResume / resumeSilentConversation). Handing an
// unanswered conversation back to the AI turned out to be the wrong default
// once a human has actually taken it — the AI has no way to know what the
// handler already said off-script, so "safe incompleteness" (this file's
// own guiding principle elsewhere in Prevent) means staying off, not
// guessing back in. Same 10-minute threshold carried forward (it was never
// about the number, just what happens at it) — see
// lib/notifications/handler-notification.ts for the actual reminder send,
// and api/cron/handler-reminders for what calls this.
export const HANDLER_REMINDER_MINUTES = 10;

export type ConversationForReminder = {
  id: string;
  latestMessageSenderType: string | null;
  latestMessageSentAt: string | null;
  handlerReminderSentAt: string | null;
};

/**
 * Given human_handling conversations paired with their latest message,
 * return the ids whose latest message is from the customer, has sat
 * unanswered for HANDLER_REMINDER_MINUTES+, and haven't already had a
 * reminder sent for this specific unanswered message (handlerReminderSentAt
 * is reset to null whenever a fresh customer message arrives — see
 * process.ts's isHumanActive branch — so an earlier reminder never suppresses
 * a later, genuinely new one). Pure so the threshold is testable without a
 * live cron trigger, same reasoning as computeDueTimerActions above.
 */
export function computeConversationsNeedingReminder(
  conversations: ConversationForReminder[],
  now: Date = new Date(),
): string[] {
  const ids: string[] = [];
  for (const conv of conversations) {
    if (conv.latestMessageSenderType !== "customer" || !conv.latestMessageSentAt) continue;
    if (conv.handlerReminderSentAt) continue;
    const minutesSinceLastMessage = (now.getTime() - new Date(conv.latestMessageSentAt).getTime()) / 60000;
    if (minutesSinceLastMessage >= HANDLER_REMINDER_MINUTES) ids.push(conv.id);
  }
  return ids;
}

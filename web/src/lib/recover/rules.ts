// Phase 2 (Recover) deterministic rules — PRD §42 "rules before intelligence".
// Pure functions, no DB/network access, so they're cheap to unit test and
// reuse (dashboard, campaign creation, future automation all read from the
// same source of truth).

export type OpportunityType =
  | "unanswered_enquiry"
  | "cold_high_intent"
  | "previous_customer_reactivation"
  | "other";

export type OpportunityForRules = {
  id: string;
  type: string;
  intent: string | null;
  estimated_value: number | null;
  status: string;
  conversationLastMessageAt: string | null;
};

// PRD §11/§12: "wait appropriate period, then follow up" — differs by
// target type. Historical/uploaded conversations have usually already
// waited this long by the time they're classified (that's often *why*
// they're a leak), so this mostly just prevents recovery outreach from
// firing the same day as a genuinely fresh conversation.
const MIN_WAIT_DAYS: Record<OpportunityType, number> = {
  unanswered_enquiry: 0, // already overdue — no reason to wait further
  cold_high_intent: 2, // brief grace period in case the customer was just momentarily busy
  previous_customer_reactivation: 0, // no freshness concept to wait out
  other: 3, // conservative default for anything that doesn't fit cleanly
};

function normalizeType(type: string): OpportunityType {
  return type === "unanswered_enquiry" ||
    type === "cold_high_intent" ||
    type === "previous_customer_reactivation"
    ? type
    : "other";
}

/** Only opportunities not yet acted on are eligible for a new campaign. */
export function isEligibleForCampaign(opportunity: { status: string }): boolean {
  return opportunity.status === "identified";
}

/**
 * Earliest the opportunity should be contacted, respecting the type's
 * minimum wait period from the source conversation's last activity.
 * Never returns a time in the past relative to now.
 */
export function computeScheduledAt(opportunity: OpportunityForRules, now: Date = new Date()): Date {
  const type = normalizeType(opportunity.type);
  const minWaitMs = MIN_WAIT_DAYS[type] * 24 * 60 * 60 * 1000;
  const lastMessageAt = opportunity.conversationLastMessageAt
    ? new Date(opportunity.conversationLastMessageAt)
    : now;
  const earliestFromWait = new Date(lastMessageAt.getTime() + minWaitMs);
  return earliestFromWait > now ? earliestFromWait : now;
}

/**
 * Deterministic 0-100 priority score — intent (60%) + relative value
 * (40%). Not a model, just a documented weighted sum, so a business can be
 * told exactly why one opportunity outranks another.
 */
export function computePriorityScore(
  opportunity: OpportunityForRules,
  maxEstimatedValueForBusiness: number,
): number {
  const intentScore =
    opportunity.intent === "high" ? 100 : opportunity.intent === "medium" ? 60 : opportunity.intent === "low" ? 30 : 0;
  const valueScore =
    opportunity.estimated_value && maxEstimatedValueForBusiness > 0
      ? Math.min(100, (opportunity.estimated_value / maxEstimatedValueForBusiness) * 100)
      : 0;
  return Math.round(intentScore * 0.6 + valueScore * 0.4);
}

// PRD §12: "One further follow-up where appropriate → Stop." First contact
// + at most one follow-up = 2 total automation attempts per opportunity.
export const MAX_AUTOMATIONS_PER_OPPORTUNITY = 2;

/**
 * A business may tighten this via businesses.max_recover_followups (Phase 4
 * "Configure Rules"); it must never be able to loosen it. PRD §12's cap is a
 * promise to the *customer being messaged*, not a business preference, so the
 * platform maximum is clamped here at the enforcement point rather than only
 * validated at the settings form — a value written directly to the database
 * (or by any future caller that forgets to validate) still cannot exceed it.
 * The DB CHECK constraint in 20260811000003_phase4_hardening.sql is the third
 * layer, not the only one.
 */
export function effectiveMaxContacts(configured: number | null | undefined): number {
  if (configured === null || configured === undefined) return MAX_AUTOMATIONS_PER_OPPORTUNITY;
  return Math.max(0, Math.min(configured, MAX_AUTOMATIONS_PER_OPPORTUNITY));
}

export function canLogAnotherContact(
  existingAutomationCount: number,
  configuredMax: number | null | undefined = undefined,
): boolean {
  return existingAutomationCount < effectiveMaxContacts(configuredMax);
}

// PRD §32/§12: the moment a customer responds, automation stops — no
// further outreach should ever be offered for this opportunity again.
const TERMINAL_STATUSES = new Set(["responded", "won", "lost", "not_sure"]);
export function isTerminal(opportunityStatus: string): boolean {
  return TERMINAL_STATUSES.has(opportunityStatus);
}

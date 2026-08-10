import "server-only";

// PRD §10 Revenue Leak Report + Revenue Readiness Score. Pure function over
// already-classified conversation data — no DB access here, so it's cheap
// to unit test and reuse (e.g. later from an admin view).

export type ConversationForReport = {
  id: string;
  leakage_type: string | null;
  classified_at: string | null;
  classification_notes: string | null;
};

export type OpportunityForReport = {
  estimated_value: number | null;
};

export type RevenueLeakReport = {
  totalConversations: number;
  classifiedConversations: number;
  leakageCounts: Record<string, number>;
  totalLeaks: number;
  estimatedOpportunityValue: number | null;
  hasAnyValueEstimate: boolean;
  readinessScore: {
    response: number;
    followUp: number;
    recovery: number;
    overall: number;
  };
  examples: { leakageType: string; note: string }[];
};

const LEAK_TYPES = [
  "no_response",
  "delayed_response",
  "abandoned_high_intent",
  "quote_not_followed_up",
  "reactivatable",
  "other",
] as const;

export function generateRevenueLeakReport(
  conversations: ConversationForReport[],
  opportunities: OpportunityForReport[],
): RevenueLeakReport {
  const classified = conversations.filter((c) => c.classified_at !== null);

  const leakageCounts: Record<string, number> = {};
  for (const type of LEAK_TYPES) leakageCounts[type] = 0;
  for (const c of classified) {
    if (c.leakage_type && c.leakage_type !== "none" && c.leakage_type in leakageCounts) {
      leakageCounts[c.leakage_type]++;
    }
  }
  const totalLeaks = Object.values(leakageCounts).reduce((sum, n) => sum + n, 0);

  const valuedOpportunities = opportunities.filter((o) => o.estimated_value !== null);
  const estimatedOpportunityValue =
    valuedOpportunities.length > 0
      ? valuedOpportunities.reduce((sum, o) => sum + (o.estimated_value ?? 0), 0)
      : null;

  // Communication device, not predictive analytics (PRD §10) — a simple,
  // explainable ratio per dimension, not a fitted model. Denominator is
  // classified conversations only; unclassified ones don't count against
  // (or for) the business yet.
  const denom = classified.length || 1;
  const responseLeaks = leakageCounts.no_response + leakageCounts.delayed_response;
  const followUpLeaks = leakageCounts.abandoned_high_intent + leakageCounts.quote_not_followed_up;
  const recoveryLeaks = leakageCounts.reactivatable;

  const response = Math.round(100 * (1 - responseLeaks / denom));
  const followUp = Math.round(100 * (1 - followUpLeaks / denom));
  const recovery = Math.round(100 * (1 - recoveryLeaks / denom));
  const overall = Math.round((response + followUp + recovery) / 3);

  const examples: { leakageType: string; note: string }[] = [];
  for (const type of LEAK_TYPES) {
    const match = classified.find((c) => c.leakage_type === type && c.classification_notes);
    if (match?.classification_notes) {
      examples.push({ leakageType: type, note: match.classification_notes });
    }
  }

  return {
    totalConversations: conversations.length,
    classifiedConversations: classified.length,
    leakageCounts,
    totalLeaks,
    estimatedOpportunityValue,
    hasAnyValueEstimate: valuedOpportunities.length > 0,
    readinessScore: { response, followUp, recovery, overall },
    examples,
  };
}

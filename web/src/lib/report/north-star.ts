// PRD §45 North Star Metric: Incremental Revenue Influenced by Capture.
// Progression: Messages handled -> Opportunities identified -> Opportunities
// recovered -> Revenue recovered -> Revenue protected/generated.
//
// Only Recover's leg (revenue recovered, from real Won outcomes) is actually
// measurable in V1 — Prevent's "revenue protected/generated" is explicitly
// not tracked yet (see PLANS.md Phase 3 Prevent Dashboard note). This
// returns `revenueProtected: null` rather than fabricating a number, and
// `incrementalRevenueInfluenced` is honestly just the Recover leg for now —
// avoid treating it as the whole North Star metric once Prevent attribution
// exists.

export type OpportunityForNorthStar = {
  status: string;
  actual_revenue: number | null;
};

export type NorthStarMetrics = {
  messagesHandled: number;
  opportunitiesIdentified: number;
  opportunitiesRecovered: number;
  revenueRecovered: number;
  revenueProtected: null;
  incrementalRevenueInfluenced: number;
};

export function computeNorthStar(
  messagesHandled: number,
  opportunities: OpportunityForNorthStar[],
): NorthStarMetrics {
  const opportunitiesIdentified = opportunities.length;
  const wonOpportunities = opportunities.filter((o) => o.status === "won");
  const opportunitiesRecovered = wonOpportunities.length;
  const revenueRecovered = wonOpportunities.reduce((sum, o) => sum + (o.actual_revenue ?? 0), 0);

  return {
    messagesHandled,
    opportunitiesIdentified,
    opportunitiesRecovered,
    revenueRecovered,
    revenueProtected: null,
    incrementalRevenueInfluenced: revenueRecovered,
  };
}

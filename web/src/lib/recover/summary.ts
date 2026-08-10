// Pure aggregation over opportunities, shared by admin/recover/[businessId]
// and the Phase 4 self-serve /dashboard so the two surfaces can never report
// different numbers for the same business.

export type OpportunityForSummary = {
  status: string;
  actual_revenue: number | null;
};

export type RecoverSummary = {
  identified: number;
  contacted: number;
  responded: number;
  recovered: number;
  revenueRecovered: number;
  hasEligible: boolean;
};

export function computeRecoverSummary(opportunities: OpportunityForSummary[]): RecoverSummary {
  const identified = opportunities.length;
  const contacted = opportunities.filter((o) => o.status !== "identified").length;
  const responded = opportunities.filter((o) =>
    ["responded", "won", "lost", "not_sure"].includes(o.status),
  ).length;
  const recovered = opportunities.filter((o) => o.status === "won").length;
  const revenueRecovered = opportunities.reduce((sum, o) => sum + (o.actual_revenue ?? 0), 0);
  const hasEligible = opportunities.some((o) => o.status === "identified");
  return { identified, contacted, responded, recovered, revenueRecovered, hasEligible };
}

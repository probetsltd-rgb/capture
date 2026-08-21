import { EngageDashboardView } from "@/components/engage/EngageDashboardView";

// Renamed from app/admin/prevent/[businessId] (2026-08-15, PLANS.md Phase
// 5.0). Founder-facing entry point — the business-owner-facing equivalent
// is /dashboard/engage, which renders the same shared view.
export default async function AdminEnginePage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  return (
    <EngageDashboardView
      businessId={businessId}
      backHref="/admin"
      backLabel="← Back to admin"
      knowledgeHref={`/admin/engage/${businessId}/knowledge`}
    />
  );
}

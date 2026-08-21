import { RecoverDashboardView } from "@/components/recover/RecoverDashboardView";

// Restructured 2026-08-15 (PLANS.md Phase 5.0) to delegate to a shared
// view — the business-owner-facing equivalent is /dashboard/recover.
export default async function AdminRecoverPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  return <RecoverDashboardView businessId={businessId} backHref="/admin" backLabel="← Back to admin" />;
}

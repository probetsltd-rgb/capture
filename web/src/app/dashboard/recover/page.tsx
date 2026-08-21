import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnBusinessId } from "@/lib/business-membership";
import { RecoverDashboardView } from "@/components/recover/RecoverDashboardView";

// New 2026-08-15 (PLANS.md Phase 5.0) — same rationale as
// dashboard/engage/page.tsx.
export default async function DashboardRecoverPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login?next=/dashboard/recover");

  const userId = claims.claims.sub as string;
  const businessId = await getOwnBusinessId(supabase, userId);
  if (!businessId) redirect("/dashboard");

  return <RecoverDashboardView businessId={businessId} backHref="/dashboard" backLabel="← Back to dashboard" />;
}

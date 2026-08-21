import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnBusinessId } from "@/lib/business-membership";
import { EngageDashboardView } from "@/components/engage/EngageDashboardView";

// New 2026-08-15 (PLANS.md Phase 5.0) — a business owner reachable here via
// their own dashboard's "View conversations →" link no longer lands on an
// "/admin" URL (a real gap the founder caught directly). Resolves the
// caller's own business from their session rather than trusting a URL
// param, same discipline as /dashboard itself.
export default async function DashboardEnginePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login?next=/dashboard/engage");

  const userId = claims.claims.sub as string;
  const businessId = await getOwnBusinessId(supabase, userId);
  if (!businessId) redirect("/dashboard"); // handles onboarding/platform-admin redirect branching

  return (
    <EngageDashboardView
      businessId={businessId}
      backHref="/dashboard"
      backLabel="← Back to dashboard"
      knowledgeHref="/dashboard/engage/knowledge"
    />
  );
}

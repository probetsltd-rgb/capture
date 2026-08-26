import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnBusinessId } from "@/lib/business-membership";
import { RecoverDashboardView } from "@/components/recover/RecoverDashboardView";
import { RecoverPaywall, type RecoverPlanOption } from "@/components/recover/RecoverPaywall";

// New 2026-08-15 (PLANS.md Phase 5.0) — same rationale as
// dashboard/engage/page.tsx.
//
// 2026-08-25: real Recover paywall added here. This page previously
// rendered RecoverDashboardView unconditionally — the free "Activate
// Recover" flag on the main /dashboard card was purely cosmetic, nothing
// here ever actually checked it, so anyone with a business could already
// reach the full campaign manager regardless of activation state. Access
// is now primarily derived from `recover_purchases`, the same source of
// truth the Paystack webhook writes to — no `businesses` column to keep
// in sync for a new purchase.
//
// Grandfather clause: a business with `recover_activated_at` already set
// pre-dates this paywall (the old free-pilot flag) — deploying this change
// must not silently cut off access someone already had, so that flag is
// still honored here, unbounded (no lookback window, matching how the
// pilot always worked). Only a business activating Recover for the first
// time after this ships goes through the real paywall.
export default async function DashboardRecoverPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login?next=/dashboard/recover");

  const userId = claims.claims.sub as string;
  const businessId = await getOwnBusinessId(supabase, userId);
  if (!businessId) redirect("/dashboard");

  const [{ data: purchases }, { data: business }] = await Promise.all([
    supabase.from("recover_purchases").select("lookback_months").eq("business_id", businessId).eq("status", "success"),
    supabase.from("businesses").select("recover_activated_at").eq("id", businessId).maybeSingle(),
  ]);

  const grandfathered = !!business?.recover_activated_at;

  if (!grandfathered && (!purchases || purchases.length === 0)) {
    const { data: plans } = await supabase
      .from("recover_plans")
      .select("id, display_name, price_kobo, lookback_months")
      .order("sort_order", { ascending: true });

    const planOptions: RecoverPlanOption[] = (plans ?? []).map((p) => ({
      id: p.id,
      displayName: p.display_name,
      priceKobo: p.price_kobo,
      lookbackMonths: p.lookback_months,
    }));

    return (
      <main className="shell app-page">
        <p>
          <a href="/dashboard">← Back to dashboard</a>
        </p>
        <h1>Recover</h1>
        <RecoverPaywall businessId={businessId} plans={planOptions} />
      </main>
    );
  }

  // A business that bought Entry then later upgraded to Extended should see
  // the wider window, not whichever purchase happens to sort first. A
  // grandfathered business with no purchases at all stays unbounded.
  const lookbackMonths =
    purchases && purchases.length > 0 ? Math.max(...purchases.map((p) => p.lookback_months)) : undefined;

  return (
    <RecoverDashboardView
      businessId={businessId}
      backHref="/dashboard"
      backLabel="← Back to dashboard"
      lookbackMonths={lookbackMonths}
    />
  );
}

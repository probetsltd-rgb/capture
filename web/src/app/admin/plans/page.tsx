import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlanEditForm } from "./PlanEditForm";
import { TrialDaysForm } from "./TrialDaysForm";

// Founder instruction 2026-08-21: every Engage tier number must be
// admin-editable, not hardcoded — this is the one place that's true. Same
// am_platform_admin() gate as /admin itself.
export default async function AdminPlansPage() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("am_platform_admin");
  if (!isAdmin) redirect("/dashboard");

  const [{ data: plans }, { data: trialSetting }] = await Promise.all([
    supabase
      .from("plans")
      .select("id, display_name, tier, billing_interval, price_kobo, message_limit, escalation_notification_limit, has_analytics, paystack_plan_code")
      .order("tier", { ascending: true })
      .order("billing_interval", { ascending: true }),
    supabase.from("app_settings").select("value").eq("key", "trial_days").maybeSingle(),
  ]);

  return (
    <main className="shell app-page">
      <h1>Capture — Engage Plans</h1>
      <p className="meta">
        <Link href="/admin">← Back to Admin</Link>
      </p>

      <section style={{ margin: "2rem 0" }}>
        <h2>Trial</h2>
        <TrialDaysForm trialDays={Number(trialSetting?.value ?? 14)} />
      </section>

      <section>
        <h2>Tiers</h2>
        <div style={{ display: "flex", gap: "var(--s5)", flexWrap: "wrap" }}>
          {(plans ?? []).map((plan) => (
            <PlanEditForm
              key={plan.id}
              plan={{
                id: plan.id,
                displayName: plan.display_name,
                billingInterval: plan.billing_interval as "monthly" | "annual",
                priceKobo: plan.price_kobo,
                messageLimit: plan.message_limit,
                escalationNotificationLimit: plan.escalation_notification_limit,
                hasAnalytics: plan.has_analytics,
                paystackPlanCode: plan.paystack_plan_code,
              }}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

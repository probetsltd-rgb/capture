import { createClient } from "@/lib/supabase/server";
import { describePlanStatus } from "@/lib/billing/describe";
import { currentPeriodStart } from "@/lib/prevent/process";
import { EngageDashboardView } from "@/components/engage/EngageDashboardView";

function formatNaira(kobo: number): string {
  return `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;
}

// Renamed from app/admin/prevent/[businessId] (2026-08-15, PLANS.md Phase
// 5.0). Founder-facing entry point — the business-owner-facing equivalent
// is /dashboard/engage, which renders the same shared view.
//
// Founder request 2026-08-21 ("unable to see who is on free tier,
// subscription to a particular plan etc") — this page previously showed
// nothing about billing at all, identical to what the business owner
// themselves sees. Added a billing detail block above it: plan/trial
// state, this period's usage against the plan's caps (a near-cap business
// is a real upsell signal), and real payment history (actual LTV, not an
// estimate).
export default async function AdminEnginePage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("plan_id, plan_status, trial_started_at, trial_ends_at, current_period_end")
    .eq("id", businessId)
    .maybeSingle();

  const { data: plan } = business?.plan_id
    ? await supabase
        .from("plans")
        .select("display_name, message_limit, escalation_notification_limit")
        .eq("id", business.plan_id)
        .maybeSingle()
    : { data: null };

  const periodStart = currentPeriodStart(business?.current_period_end ?? null).toISOString();
  const [{ count: messagesThisPeriod }, { count: escalationNotificationsThisPeriod }, { data: payments }] =
    await Promise.all([
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("sender_type", "ai")
        .gte("sent_at", periodStart),
      supabase
        .from("escalation_notifications")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .gte("sent_at", periodStart),
      supabase
        .from("payments")
        .select("paystack_reference, amount_kobo, status, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false }),
    ]);

  const planLabel = business
    ? describePlanStatus(
        {
          planStatus: business.plan_status,
          trialStartedAt: business.trial_started_at,
          trialEndsAt: business.trial_ends_at,
          currentPeriodEnd: business.current_period_end,
        },
        plan?.display_name ?? null,
      )
    : "No plan";

  const totalPaidKobo = (payments ?? [])
    .filter((p) => p.status === "success")
    .reduce((sum, p) => sum + p.amount_kobo, 0);

  return (
    <>
      {/* EngageDashboardView below renders its own <main className="shell
          app-page"> — this uses a div with the same classes rather than a
          second <main> landmark, so this section still gets the shell's
          width/spacing without duplicating the page's main region. */}
      <div className="shell app-page">
      <section style={{ margin: "1.5rem 0" }}>
        <h2>Billing</h2>
        <table className="table">
          <tbody>
            <tr>
              <td>Plan</td>
              <td>{planLabel}</td>
            </tr>
            {plan && (
              <>
                <tr>
                  <td>Messages this period</td>
                  <td>
                    {messagesThisPeriod ?? 0}
                    {plan.message_limit ? ` / ${plan.message_limit}` : " (unlimited)"}
                  </td>
                </tr>
                <tr>
                  <td>Escalation notifications this period</td>
                  <td>
                    {escalationNotificationsThisPeriod ?? 0} / {plan.escalation_notification_limit}
                  </td>
                </tr>
              </>
            )}
            <tr>
              <td>Total paid to date</td>
              <td className="mono">{formatNaira(totalPaidKobo)}</td>
            </tr>
          </tbody>
        </table>
        {payments && payments.length > 0 && (
          <div className="table__scroll" style={{ marginTop: "var(--s4)" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.paystack_reference}>
                    <td>{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="mono">{formatNaira(p.amount_kobo)}</td>
                    <td>{p.status}</td>
                    <td className="mono">{p.paystack_reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>

      <EngageDashboardView
        businessId={businessId}
        backHref="/admin"
        backLabel="← Back to admin"
        knowledgeHref={`/admin/engage/${businessId}/knowledge`}
      />
    </>
  );
}

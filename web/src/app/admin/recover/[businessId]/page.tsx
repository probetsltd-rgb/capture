import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StartCampaignButton } from "./StartCampaignButton";
import { CampaignActions } from "./CampaignActions";

const TYPE_LABELS: Record<string, string> = {
  unanswered_enquiry: "Unanswered enquiry",
  cold_high_intent: "Cold high-intent",
  previous_customer_reactivation: "Previous customer",
  other: "Other",
};

function formatNaira(value: number): string {
  return `₦${Math.round(value).toLocaleString("en-NG")}`;
}

export default async function RecoverCampaignPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .maybeSingle();

  if (!business) {
    return (
      <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "sans-serif" }}>
        <h1>Not found</h1>
        <p>No business visible with this ID — either it doesn&apos;t exist, or RLS denied access.</p>
      </main>
    );
  }

  const [{ data: opportunities }, { data: customers }, { data: automations }] = await Promise.all([
    supabase
      .from("opportunities")
      .select("id, type, intent, estimated_value, actual_revenue, status, customer_id")
      .eq("business_id", businessId),
    supabase.from("customers").select("id, name").eq("business_id", businessId),
    supabase.from("automations").select("id, opportunity_id, status").eq("business_id", businessId),
  ]);

  const customerNameById = new Map((customers ?? []).map((c) => [c.id, c.name]));
  const pendingAutomationByOpportunity = new Set(
    (automations ?? []).filter((a) => a.status === "pending").map((a) => a.opportunity_id),
  );

  const opps = opportunities ?? [];
  const identified = opps.length;
  const contacted = opps.filter((o) => o.status !== "identified").length;
  const responded = opps.filter((o) => ["responded", "won", "lost", "not_sure"].includes(o.status)).length;
  const recovered = opps.filter((o) => o.status === "won").length;
  const revenueRecovered = opps.reduce((sum, o) => sum + (o.actual_revenue ?? 0), 0);
  const hasEligible = opps.some((o) => o.status === "identified");

  return (
    <main style={{ maxWidth: 900, margin: "3rem auto", fontFamily: "sans-serif" }}>
      <p>
        <Link href="/admin">← Back to admin</Link>
      </p>
      <h1>Recover — {business.name}</h1>

      <section style={{ margin: "1.5rem 0" }}>
        <h2>Campaign dashboard</h2>
        <table style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Opportunities identified</td>
              <td>{identified}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Contacted</td>
              <td>{contacted}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Responses</td>
              <td>{responded}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Recovered (Won)</td>
              <td>{recovered}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0", fontWeight: 700 }}>Revenue recovered</td>
              <td style={{ fontWeight: 700 }}>{formatNaira(revenueRecovered)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {hasEligible && <StartCampaignButton businessId={businessId} />}

      <section>
        <h2>Opportunities</h2>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
              <th style={{ padding: "0.4rem" }}>Customer</th>
              <th style={{ padding: "0.4rem" }}>Type</th>
              <th style={{ padding: "0.4rem" }}>Intent</th>
              <th style={{ padding: "0.4rem" }}>Est. value</th>
              <th style={{ padding: "0.4rem" }}>Status</th>
              <th style={{ padding: "0.4rem" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {opps.map((o) => (
              <tr key={o.id} style={{ borderBottom: "1px solid #222" }}>
                <td style={{ padding: "0.4rem" }}>{customerNameById.get(o.customer_id) ?? "—"}</td>
                <td style={{ padding: "0.4rem" }}>{TYPE_LABELS[o.type] ?? o.type}</td>
                <td style={{ padding: "0.4rem" }}>{o.intent ?? "—"}</td>
                <td style={{ padding: "0.4rem" }}>{o.estimated_value ? formatNaira(o.estimated_value) : "—"}</td>
                <td style={{ padding: "0.4rem" }}>{o.status}</td>
                <td style={{ padding: "0.4rem" }}>
                  <CampaignActions
                    opportunityId={o.id}
                    businessId={businessId}
                    status={o.status}
                    hasPendingAutomation={pendingAutomationByOpportunity.has(o.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

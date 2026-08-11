import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeRecoverSummary } from "@/lib/recover/summary";
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
      <main className="shell app-page">
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
  const { identified, contacted, responded, recovered, revenueRecovered, hasEligible } =
    computeRecoverSummary(opps);

  return (
    <main className="shell app-page">
      <p>
        <Link href="/admin">← Back to admin</Link>
      </p>
      <h1>Recover — {business.name}</h1>

      <section >
        <h2>Campaign dashboard</h2>
        <table className="table">
          <tbody>
            <tr>
              <td >Opportunities identified</td>
              <td>{identified}</td>
            </tr>
            <tr>
              <td >Contacted</td>
              <td>{contacted}</td>
            </tr>
            <tr>
              <td >Responses</td>
              <td>{responded}</td>
            </tr>
            <tr>
              <td >Recovered (Won)</td>
              <td>{recovered}</td>
            </tr>
            <tr>
              <td >Revenue recovered</td>
              <td >{formatNaira(revenueRecovered)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {hasEligible && <StartCampaignButton businessId={businessId} />}

      <section>
        <h2>Opportunities</h2>
        <table className="table">
          <thead>
            <tr >
              <th >Customer</th>
              <th >Type</th>
              <th >Intent</th>
              <th >Est. value</th>
              <th >Status</th>
              <th >Action</th>
            </tr>
          </thead>
          <tbody>
            {opps.map((o) => (
              <tr key={o.id} >
                <td >{customerNameById.get(o.customer_id) ?? "—"}</td>
                <td >{TYPE_LABELS[o.type] ?? o.type}</td>
                <td >{o.intent ?? "—"}</td>
                <td >{o.estimated_value ? formatNaira(o.estimated_value) : "—"}</td>
                <td >{o.status}</td>
                <td >
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

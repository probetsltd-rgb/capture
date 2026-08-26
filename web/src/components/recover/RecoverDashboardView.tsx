import { Fragment } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeRecoverSummary } from "@/lib/recover/summary";
import { StartCampaignButton } from "./StartCampaignButton";
import { CampaignActions } from "./CampaignActions";
import { CopyDraftMessage } from "./CopyDraftMessage";

const TYPE_LABELS: Record<string, string> = {
  unanswered_enquiry: "Unanswered enquiry",
  cold_high_intent: "Cold high-intent",
  previous_customer_reactivation: "Previous customer",
  other: "Other",
};

function formatNaira(value: number): string {
  return `₦${Math.round(value).toLocaleString("en-NG")}`;
}

// Two "high intent" opportunities read as equally urgent by intent/value
// alone — a founder caught this directly ("prioritizing a client from 5
// weeks ago over one from 5 years ago"). This surfaces the actual elapsed
// time so a human can weigh recency themselves; it doesn't change
// computePriorityScore's ranking (a scheduling-behavior change, not a
// display one — out of scope for this pass).
function formatColdFor(lastMessageAt: string | null): string {
  if (!lastMessageAt) return "—";
  const days = Math.floor((Date.now() - new Date(lastMessageAt).getTime()) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  if (days < 730) return `${Math.floor(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

// Shared body for both /admin/recover/[businessId] (founder) and
// /dashboard/recover (business owner, own businessId from session) —
// extracted 2026-08-15 alongside the same restructure for Engage, so a
// business owner isn't landed on an "/admin" URL for this either.
export async function RecoverDashboardView({
  businessId,
  backHref,
  backLabel,
  lookbackMonths,
}: {
  businessId: string;
  backHref: string;
  backLabel: string;
  // How much history the business paid for (recover_purchases.lookback_months,
  // max across their purchases — see dashboard/recover/page.tsx). Undefined
  // means unbounded, for the founder-facing /admin/recover/[businessId] view,
  // which isn't gated by a purchase.
  lookbackMonths?: number;
}) {
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
      .select("id, type, intent, estimated_value, actual_revenue, status, customer_id, source_conversation_id")
      .eq("business_id", businessId),
    supabase.from("customers").select("id, name").eq("business_id", businessId),
    supabase
      .from("automations")
      .select("id, opportunity_id, status, draft_message, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false }),
  ]);

  const customerNameById = new Map((customers ?? []).map((c) => [c.id, c.name]));
  const pendingAutomationByOpportunity = new Set(
    (automations ?? []).filter((a) => a.status === "pending").map((a) => a.opportunity_id),
  );
  // Most recent automation per opportunity carries the live draft — an
  // opportunity queued more than once (e.g. after a failed first attempt)
  // should show its latest suggested message, not its first.
  const draftByOpportunity = new Map<string, string>();
  for (const a of automations ?? []) {
    if (a.draft_message && !draftByOpportunity.has(a.opportunity_id)) {
      draftByOpportunity.set(a.opportunity_id, a.draft_message);
    }
  }

  const opportunityConversationIds = (opportunities ?? [])
    .map((o) => o.source_conversation_id)
    .filter((id): id is string => id !== null);
  const { data: sourceConversations } = opportunityConversationIds.length
    ? await supabase.from("conversations").select("id, last_message_at").in("id", opportunityConversationIds)
    : { data: [] as { id: string; last_message_at: string | null }[] };
  const lastMessageByConversationId = new Map((sourceConversations ?? []).map((c) => [c.id, c.last_message_at]));

  // New 2026-08-25 (Recover paid tiers): a business only paid to have this
  // many months of history worked. An opportunity with no resolvable
  // timestamp is kept rather than hidden — an unknown age isn't evidence
  // it's out of window, and silently dropping it would look like data loss
  // to whoever's reading this table.
  const cutoff = lookbackMonths != null ? new Date() : null;
  if (cutoff) cutoff.setMonth(cutoff.getMonth() - lookbackMonths!);
  const inWindow = (opportunities ?? []).filter((o) => {
    if (!cutoff) return true;
    const t = o.source_conversation_id ? lastMessageByConversationId.get(o.source_conversation_id) : null;
    if (!t) return true;
    return new Date(t).getTime() >= cutoff.getTime();
  });

  // Oldest first — otherwise a stale, easy-to-miss lead sits below fresher
  // same-intent ones purely by insertion order, the exact prioritization
  // trap being fixed here.
  const opps = [...inWindow].sort((a, b) => {
    const aTime = a.source_conversation_id ? lastMessageByConversationId.get(a.source_conversation_id) : null;
    const bTime = b.source_conversation_id ? lastMessageByConversationId.get(b.source_conversation_id) : null;
    if (!aTime && !bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;
    return new Date(aTime).getTime() - new Date(bTime).getTime();
  });
  const { identified, contacted, responded, recovered, revenueRecovered, hasEligible } =
    computeRecoverSummary(opps);

  return (
    <main className="shell app-page">
      <p>
        <Link href={backHref}>{backLabel}</Link>
      </p>
      <h1>Recover — {business.name}</h1>
      {lookbackMonths != null && (
        <p className="meta">
          Showing opportunities from the last {lookbackMonths} month{lookbackMonths === 1 ? "" : "s"} of
          conversations, per your plan.
        </p>
      )}

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
        <div className="table__scroll">
        <table className="table">
          <thead>
            <tr >
              <th >Customer</th>
              <th >Type</th>
              <th >Intent</th>
              <th >Cold for</th>
              <th >Est. value</th>
              <th >Status</th>
              <th >Action</th>
            </tr>
          </thead>
          <tbody>
            {opps.map((o) => (
              <Fragment key={o.id}>
                <tr>
                  <td >{customerNameById.get(o.customer_id) ?? "—"}</td>
                  <td >{TYPE_LABELS[o.type] ?? o.type}</td>
                  <td >{o.intent ?? "—"}</td>
                  <td className="mono">
                    {formatColdFor(
                      o.source_conversation_id ? (lastMessageByConversationId.get(o.source_conversation_id) ?? null) : null,
                    )}
                  </td>
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
                {draftByOpportunity.has(o.id) && (
                  <tr>
                    <td colSpan={7} style={{ paddingTop: 0 }}>
                      <CopyDraftMessage message={draftByOpportunity.get(o.id)!} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </main>
  );
}

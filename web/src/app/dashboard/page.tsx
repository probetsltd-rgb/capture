import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnBusinessId } from "@/lib/business-membership";
import { computeRecoverSummary } from "@/lib/recover/summary";
import { computePreventSummary } from "@/lib/prevent/summary";
import { computeNorthStar } from "@/lib/report/north-star";
import { getInstagramConnectionStatus } from "@/lib/channels/instagram";
import { generateRevenueLeakReport } from "@/lib/report/generate";
import { checkBillingGate } from "@/lib/prevent/process";
import { ActivateButton } from "./ActivateButton";
import { DisconnectInstagramButton } from "./DisconnectInstagramButton";
import { EngagePaywall } from "./EngagePaywall";

const LEAK_LABELS: Record<string, string> = {
  no_response: "Unanswered enquiries",
  delayed_response: "Delayed responses",
  abandoned_high_intent: "High-intent conversations with no follow-up",
  quote_not_followed_up: "Quotes never followed up",
  reactivatable: "Previous customers worth reactivating",
  other: "Other leakage",
};

function formatNaira(value: number): string {
  return `₦${Math.round(value).toLocaleString("en-NG")}`;
}

// The self-service home for a business owner — Phase 4 "standardised
// onboarding across Find/Recover/Engage" continues here: one place a
// business checks all three products, rather than only ever seeing them
// through founder-run /admin. Detailed campaign/conversation actions live
// at /dashboard/recover and /dashboard/engage — shared view components
// (components/recover/, components/engage/) also power the founder-facing
// /admin/recover/[id] and /admin/engage/[id] equivalents, so this isn't a
// duplicated implementation, just a different entry point and back-link.
// Restructured 2026-08-15 (PLANS.md Phase 5.0) after a founder directly
// caught the previous version landing business owners on "/admin" URLs.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ instagram?: string; reason?: string }>;
}) {
  const { instagram: instagramStatus, reason: instagramReason } = await searchParams;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login?next=/dashboard");

  const userId = claims.claims.sub as string;
  const businessId = await getOwnBusinessId(supabase, userId);
  if (!businessId) {
    // A platform_admin legitimately owns no business — funnelling that
    // account into "set up your business" onboarding was a real bug a
    // founder caught directly, using their own admin account. Only a
    // genuine business-less user should land on /onboarding.
    const { data: isAdmin } = await supabase.rpc("am_platform_admin");
    redirect(isAdmin ? "/admin" : "/onboarding");
  }

  const { data: business } = await supabase
    .from("businesses")
    .select(
      "id, name, industry, upload_token, onboarded_at, prevent_activated_at, plan_status, trial_started_at, trial_ends_at, current_period_end",
    )
    .eq("id", businessId)
    .maybeSingle();

  if (!business) redirect("/onboarding");

  const [
    { data: opportunities },
    { data: findConversations },
    { data: preventConversations },
    { count: knowledgeCount },
    { count: pendingKnowledgeCount },
    { data: plans },
    instagramConnection,
  ] = await Promise.all([
    supabase.from("opportunities").select("status, actual_revenue").eq("business_id", businessId),
    supabase.from("conversations").select("id").eq("business_id", businessId).eq("source", "manual_export").limit(1),
    supabase
      .from("conversations")
      .select("id, escalated_at, qualification, ai_followup_count")
      .eq("business_id", businessId)
      // whatsapp_api + instagram_api — this filter silently excluded real,
      // live Instagram conversations from the "Prevent" stats table below
      // until 2026-08-15 (same bug independently found and fixed the same
      // day on /admin/page.tsx and /admin/prevent/[businessId]/page.tsx).
      .in("source", ["whatsapp_api", "instagram_api"]),
    supabase
      .from("knowledge_items")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .not("approved_at", "is", null),
    // Includes items seeded from the 30-day Instagram history (2026-08-21)
    // as well as brochure/manual-entry items awaiting review — the CTA
    // below doesn't need to distinguish the source, just that review work
    // is waiting.
    supabase
      .from("knowledge_items")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .is("approved_at", null),
    supabase.from("plans").select("id, display_name, price_kobo, message_limit, escalation_notification_limit, has_analytics"),
    getInstagramConnectionStatus(businessId),
  ]);

  // Founder request 2026-08-21 (pay-to-continue billing) — same gate
  // function lib/prevent/process.ts actually enforces, reused here so the
  // dashboard never shows a stale/different picture from what's really
  // blocking Engage.
  const billingGateReason = checkBillingGate({
    planStatus: business.plan_status,
    trialStartedAt: business.trial_started_at,
    trialEndsAt: business.trial_ends_at,
    currentPeriodEnd: business.current_period_end,
  });

  // 30-day baseline (Capture_PRD_Addendum_v2.md §16) — real API-ingested
  // conversations only, never the manual-export history, so this reflects
  // what Engage is actually seeing rather than Find's separate audit.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: baselineConversations }, { data: baselineOpportunities }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, leakage_type, classified_at, classification_notes")
      .eq("business_id", businessId)
      .eq("source", "instagram_api")
      .gte("first_message_at", thirtyDaysAgo),
    supabase
      .from("opportunities")
      .select("estimated_value, source_conversation_id")
      .eq("business_id", businessId),
  ]);
  // Cloud-review-caught 2026-08-21 (real bug, confirmed by reading this
  // code): `baselineOpportunities` above is only scoped by business_id — no
  // channel, no time window — so passing it into generateRevenueLeakReport
  // unfiltered would sum ALL of a business's opportunities (including
  // Find/WhatsApp-sourced ones from months ago) into a value rendered
  // inside a section labeled "Your last 30 days on Instagram." Filtering
  // here, not in generateRevenueLeakReport itself, since that function's
  // original caller (/report/[token]) genuinely does want every opportunity
  // it's handed — the mismatch is specific to this call site passing a
  // channel/time-scoped conversation set against an unscoped opportunity
  // set.
  const baselineConversationIds = new Set((baselineConversations ?? []).map((c) => c.id));
  const scopedBaselineOpportunities = (baselineOpportunities ?? []).filter(
    (o) => o.source_conversation_id && baselineConversationIds.has(o.source_conversation_id),
  );
  const baseline =
    baselineConversations && baselineConversations.length > 0
      ? generateRevenueLeakReport(baselineConversations, scopedBaselineOpportunities)
      : null;
  const baselineLeaks = baseline ? Object.entries(baseline.leakageCounts).filter(([, count]) => count > 0) : [];

  const preventConvs = preventConversations ?? [];
  const preventConvIds = preventConvs.map((c) => c.id);
  const { data: aiMessages } = preventConvIds.length
    ? await supabase.from("messages").select("conversation_id").eq("sender_type", "ai").in("conversation_id", preventConvIds)
    : { data: [] };
  const answeredIds = new Set((aiMessages ?? []).map((m) => m.conversation_id));

  // Scoped to Prevent conversations only — see north-star.ts on why the
  // uploaded Find history must not count as "messages handled".
  const { count: handledMessagesCount } = preventConvIds.length
    ? await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", preventConvIds)
    : { count: 0 };

  const recover = computeRecoverSummary(opportunities ?? []);
  const prevent = computePreventSummary(preventConvs, answeredIds);
  const northStar = computeNorthStar(handledMessagesCount ?? 0, opportunities ?? []);

  const hasFindData = (findConversations?.length ?? 0) > 0;

  return (
    <main className="shell app-page">
      <h1>{business.name}</h1>
      <p className="meta">
        {business.industry ?? "No industry set"} · <Link href="/dashboard/settings">Configure rules →</Link>
      </p>

      {instagramStatus === "connected" && (
        <p className="notice notice--ok" style={{ marginTop: "var(--s4)" }}>
          Instagram connected
          {instagramConnection.connected && instagramConnection.username
            ? ` — @${instagramConnection.username}`
            : ""}
          .
        </p>
      )}
      {instagramStatus === "connected_degraded" && (
        <p className="notice notice--error" style={{ marginTop: "var(--s4)" }}>
          Instagram connected
          {instagramConnection.connected && instagramConnection.username
            ? ` — @${instagramConnection.username}`
            : ""}
          , but only with a short-lived connection (expires in under an hour) — a known issue we&apos;re still
          fixing. You&apos;ll need to reconnect again soon.
        </p>
      )}
      {instagramStatus === "error" && (
        <p className="notice notice--error" style={{ marginTop: "var(--s4)" }}>
          Instagram connection failed{instagramReason ? ` (${instagramReason})` : ""} — please try again, or contact
          us if it keeps happening.
        </p>
      )}

      {baseline && (
        <section style={{ paddingTop: "var(--s6)" }}>
          <h2>Your last 30 days on Instagram</h2>
          <p className="meta">
            {baseline.classifiedConversations} of {baseline.totalConversations} conversation
            {baseline.totalConversations === 1 ? "" : "s"} analysed
            {baseline.classifiedConversations < baseline.totalConversations
              ? " so far — refresh in a moment for the rest."
              : "."}
          </p>
          <table className="table">
            <tbody>
              <tr>
                <td>Conversations</td>
                <td>{baseline.totalConversations}</td>
              </tr>
              {baselineLeaks.map(([type, count]) => (
                <tr key={type}>
                  <td>{LEAK_LABELS[type] ?? type}</td>
                  <td className="dormant">{count}</td>
                </tr>
              ))}
              <tr>
                <td>Potentially recoverable</td>
                <td>
                  {baseline.totalLeaks} of {baseline.classifiedConversations}
                </td>
              </tr>
              <tr>
                <td>Revenue Readiness Score</td>
                <td>{baseline.readinessScore.overall}/100</td>
              </tr>
              {baseline.hasAnyValueEstimate && (
                <tr>
                  <td>Estimated opportunity value</td>
                  <td className="mono realised">{formatNaira(baseline.estimatedOpportunityValue ?? 0)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="meta" style={{ marginTop: "var(--s3)" }}>
            Average response time isn&apos;t measured yet — that&apos;s a known gap, not omitted by accident.
            {baseline.hasAnyValueEstimate && " Estimated opportunity value is not a revenue guarantee."}
          </p>
          {(pendingKnowledgeCount ?? 0) > 0 && (
            <p className="notice notice--ok" style={{ marginTop: "var(--s3)" }}>
              We drafted {pendingKnowledgeCount} knowledge item{pendingKnowledgeCount === 1 ? "" : "s"} from what you
              already told customers in these conversations —{" "}
              <Link href="/dashboard/engage/knowledge">review and approve them →</Link>
            </p>
          )}
        </section>
      )}

      <div className="app-grid">
        <section>
          <h2>Find</h2>
          {hasFindData ? (
            <p>
              <Link href={`/report/${business.upload_token}`}>View your Revenue Leak Report →</Link>
            </p>
          ) : (
            <p>
              No conversations uploaded yet.{" "}
              <Link href={`/upload/${business.upload_token}`}>Upload WhatsApp or Instagram conversations →</Link>
            </p>
          )}
        </section>

        <section>
          {/* 2026-08-25: real purchase-gated access now lives entirely at
              /dashboard/recover (see that page's gate) — no activation
              status is claimed here to avoid two places computing it and
              drifting apart, the exact gap that used to leave this page's
              free ActivateButton reachable regardless of real access. */}
          <h2>Recover</h2>
          <table className="table">
            <tbody>
              <tr>
                <td >Opportunities identified</td>
                <td>{recover.identified}</td>
              </tr>
              <tr>
                <td >Contacted</td>
                <td>{recover.contacted}</td>
              </tr>
              <tr>
                <td >Revenue recovered</td>
                <td >{formatNaira(recover.revenueRecovered)}</td>
              </tr>
            </tbody>
          </table>
          <p>
            <Link href="/dashboard/recover">Manage campaign →</Link>
          </p>
        </section>

        <section>
          <h2>Engage {business.prevent_activated_at ? "· Active" : "· Not activated"}</h2>
          {business.prevent_activated_at && billingGateReason && (
            <EngagePaywall
              businessId={businessId}
              reason={billingGateReason}
              plans={(plans ?? []).map((p) => ({
                id: p.id,
                displayName: p.display_name,
                priceKobo: p.price_kobo,
                messageLimit: p.message_limit,
                escalationNotificationLimit: p.escalation_notification_limit,
                hasAnalytics: p.has_analytics,
              }))}
            />
          )}
          {/* Moved out of the stats table and given real visual weight
              2026-08-31 — a founder testing Connect end-to-end for the
              first time on a non-tester account found it as a plain text
              link buried three rows down, easy to miss on the exact
              account (freshly onboarded, nothing connected yet) that most
              needs it. The account-type note is here, not just in the
              FAQ, because it's the actual failure mode that prompted
              this: Instagram's own OAuth silently dead-ends (no
              permission screen, no redirect back) for a Personal account
              instead of surfacing an error — see /api/channels/instagram/
              callback's zero-hit prod logs from that test. */}
          {!instagramConnection.connected && (
            <div
              style={{
                marginTop: "var(--s4)",
                padding: "var(--s5)",
                border: "1px solid var(--rule)",
                borderRadius: "var(--radius)",
                background: "var(--paper)",
              }}
            >
              <h3 className="h3">Connect Instagram to start</h3>
              <p className="body" style={{ marginTop: "var(--s2)" }}>
                Engage can&apos;t receive or answer enquiries until Instagram is connected. Needs a
                Professional Instagram account — Business or Creator, not Personal —{" "}
                <Link href="/#faq">more in the FAQ →</Link>.
              </p>
              <Link
                href="/api/channels/instagram/connect"
                className="btn btn--primary"
                style={{ marginTop: "var(--s4)", display: "inline-block" }}
              >
                Connect Instagram →
              </Link>
            </div>
          )}
          <table className="table" style={{ marginTop: "var(--s5)" }}>
            <tbody>
              <tr>
                <td >Enquiries received</td>
                <td>{prevent.enquiriesReceived}</td>
              </tr>
              <tr>
                <td >Enquiries answered</td>
                <td>{prevent.enquiriesAnswered}</td>
              </tr>
              <tr>
                <td >Human handoffs</td>
                <td>{prevent.humanHandoffs}</td>
              </tr>
              <tr>
                <td >Approved knowledge items</td>
                <td>{knowledgeCount ?? 0}</td>
              </tr>
              <tr>
                <td>Instagram</td>
                <td>
                  {instagramConnection.connected ? (
                    <span style={{ display: "inline-flex", gap: "var(--s3)", alignItems: "center" }}>
                      Connected{instagramConnection.username ? ` as @${instagramConnection.username}` : ""}
                      <Link href="/api/channels/instagram/connect">Reconnect</Link>
                      <DisconnectInstagramButton businessId={businessId} />
                    </span>
                  ) : (
                    "Not connected"
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            <Link href="/dashboard/engage">View conversations →</Link> ·{" "}
            <Link href="/dashboard/engage/knowledge">Manage approved knowledge →</Link>
          </p>
          {!business.prevent_activated_at && <ActivateButton businessId={businessId} product="prevent" />}
        </section>
      </div>

      <section style={{ paddingTop: "var(--s6)", borderTop: "1px solid var(--rule)" }}>
        <h2>Incremental Revenue Influenced by Capture</h2>
        <p className="meta">
          Messages handled → opportunities identified → opportunities recovered → revenue recovered → revenue
          protected/generated. Only the Recover leg is measurable today.
        </p>
        <table className="table">
          <tbody>
            <tr>
              <td >Messages handled</td>
              <td>{northStar.messagesHandled}</td>
            </tr>
            <tr>
              <td >Opportunities identified</td>
              <td>{northStar.opportunitiesIdentified}</td>
            </tr>
            <tr>
              <td >Opportunities recovered</td>
              <td>{northStar.opportunitiesRecovered}</td>
            </tr>
            <tr>
              <td >Revenue protected/generated (Engage)</td>
              <td className="meta">Not yet tracked</td>
            </tr>
            <tr>
              <td >
                Incremental revenue influenced
              </td>
              <td >{formatNaira(northStar.incrementalRevenueInfluenced)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}

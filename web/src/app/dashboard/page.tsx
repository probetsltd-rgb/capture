import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnBusinessId } from "@/lib/business-membership";
import { computeRecoverSummary } from "@/lib/recover/summary";
import { computePreventSummary } from "@/lib/prevent/summary";
import { computeNorthStar } from "@/lib/report/north-star";
import { getInstagramConnectionStatus } from "@/lib/channels/instagram";
import { getWhatsAppConnectionStatus } from "@/lib/channels/whatsapp";
import { getFacebookConnectionStatus } from "@/lib/channels/facebook";
import { ConnectWhatsAppButton } from "./ConnectWhatsAppButton";
import { ReconnectWhatsAppButton } from "./ReconnectWhatsAppButton";
import { DisconnectWhatsAppButton } from "./DisconnectWhatsAppButton";
import { ConnectFacebookButton } from "./ConnectFacebookButton";
import { DisconnectFacebookButton } from "./DisconnectFacebookButton";
import { generateRevenueLeakReport } from "@/lib/report/generate";
import { computeResponseTimeStats, formatResponseDuration } from "@/lib/report/response-time";
import { checkBillingGate } from "@/lib/prevent/process";
import { describePlanStatus } from "@/lib/billing/describe";
import { ActivateButton } from "./ActivateButton";
import { DisconnectInstagramButton } from "./DisconnectInstagramButton";
import { EngagePaywall } from "./EngagePaywall";
import { CancelSubscriptionButton } from "./CancelSubscriptionButton";

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
  // Not secret (an App ID/Configuration ID are meant to be visible to a
  // client-side Facebook Login flow) — read server-side and passed as
  // props rather than duplicated under a NEXT_PUBLIC_ name.
  const whatsappAppId = process.env.WHATSAPP_APP_ID ?? null;
  const whatsappConfigId = process.env.WHATSAPP_CONFIG_ID ?? null;
  const facebookAppId = process.env.FACEBOOK_APP_ID ?? null;
  const facebookConfigId = process.env.FACEBOOK_CONFIG_ID ?? null;

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
      "id, name, industry, upload_token, onboarded_at, prevent_activated_at, plan_id, plan_status, trial_started_at, trial_ends_at, current_period_end",
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
    whatsappConnection,
    facebookConnection,
  ] = await Promise.all([
    supabase.from("opportunities").select("status, actual_revenue").eq("business_id", businessId),
    supabase.from("conversations").select("id").eq("business_id", businessId).eq("source", "manual_export").limit(1),
    supabase
      .from("conversations")
      .select("id, escalated_at, qualification, ai_followup_count")
      .eq("business_id", businessId)
      // whatsapp_api + instagram_api + facebook_api — this filter silently
      // excluded real, live Instagram conversations from the "Prevent"
      // stats table below until 2026-08-15 (same bug independently found
      // and fixed the same day on /admin/page.tsx and
      // /admin/prevent/[businessId]/page.tsx) — facebook_api added here
      // from day one this time.
      .in("source", ["whatsapp_api", "instagram_api", "facebook_api"]),
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
    supabase.from("plans").select("id, display_name, tier, billing_interval, price_kobo, message_limit, escalation_notification_limit, has_analytics"),
    getInstagramConnectionStatus(businessId),
    getWhatsAppConnectionStatus(businessId),
    getFacebookConnectionStatus(businessId),
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

  // Founder request 2026-09-08 (open want since 2026-08-15, PRD Addendum
  // §18's own Day-5 example) — real average/fastest/slowest first-response
  // time, same 30-day/Instagram-only scope as the baseline above. Fetched
  // separately rather than folded into the conversations query above
  // (which only selects classification columns) since this needs full
  // message timestamps, batched once here rather than per-conversation.
  const { data: baselineMessages } = baselineConversationIds.size
    ? await supabase
        .from("messages")
        .select("conversation_id, sender_type, sent_at")
        .in("conversation_id", Array.from(baselineConversationIds))
    : { data: [] };
  const responseTimeStats = computeResponseTimeStats(baselineMessages ?? []);

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
        {business.industry ?? "No industry set"} · <Link href="/dashboard/settings">Settings →</Link>
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
        <div className="panel" style={{ marginTop: "var(--s6)" }}>
          <div className="panel__head">
            <h2 className="h3" style={{ margin: 0 }}>Your last 30 days on Instagram</h2>
          </div>
          <div className="panel__body">
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
              {responseTimeStats && (
                <>
                  <tr>
                    <td>Average response time</td>
                    <td className="mono">{formatResponseDuration(responseTimeStats.averageSeconds)}</td>
                  </tr>
                  <tr>
                    <td>Fastest response</td>
                    <td className="mono realised">{formatResponseDuration(responseTimeStats.minSeconds)}</td>
                  </tr>
                  <tr>
                    <td>Slowest response</td>
                    <td className="mono dormant">{formatResponseDuration(responseTimeStats.maxSeconds)}</td>
                  </tr>
                </>
              )}
              {baseline.hasAnyValueEstimate && (
                <tr>
                  <td>Estimated opportunity value</td>
                  <td className="mono realised">{formatNaira(baseline.estimatedOpportunityValue ?? 0)}</td>
                </tr>
              )}
            </tbody>
          </table>
          {baseline.hasAnyValueEstimate && (
            <p className="meta" style={{ marginTop: "var(--s3)" }}>
              Estimated opportunity value is not a revenue guarantee.
            </p>
          )}
          {(pendingKnowledgeCount ?? 0) > 0 && (
            <p className="notice notice--ok" style={{ marginTop: "var(--s3)" }}>
              We drafted {pendingKnowledgeCount} knowledge item{pendingKnowledgeCount === 1 ? "" : "s"} from what you
              already told customers in these conversations —{" "}
              <Link href="/dashboard/engage/knowledge">review and approve them →</Link>
            </p>
          )}
          </div>
        </div>
      )}

      <div className="app-grid">
        <div className="panel">
          <div className="panel__head">
            <h2 className="h3" style={{ margin: 0 }}>Find</h2>
          </div>
          <div className="panel__body">
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
          </div>
        </div>

        <div className="panel">
          {/* 2026-08-25: real purchase-gated access now lives entirely at
              /dashboard/recover (see that page's gate) — no activation
              status is claimed here to avoid two places computing it and
              drifting apart, the exact gap that used to leave this page's
              free ActivateButton reachable regardless of real access. */}
          <div className="panel__head">
            <h2 className="h3" style={{ margin: 0 }}>Recover</h2>
          </div>
          <div className="panel__body">
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
          </div>
        </div>

        {/* Engage leads, per the whole Engage-first pivot (PLANS.md 5.7) —
            founder-caught 2026-09-08: this rendered last in the grid,
            wrapping alone onto its own row below Find+Recover instead of
            leading. `order` moves it first visually without relocating the
            large block of markup below (avoids a risky cut-paste of code
            with real interdependencies on state above it). */}
        <div className="panel app-grid__lead" style={{ order: -1 }}>
          <div className="panel__head">
            <h2 className="h3" style={{ margin: 0 }}>
              Engage {business.prevent_activated_at ? "· Active" : "· Not activated"}
            </h2>
          </div>
          <div className="panel__body">
          {business.prevent_activated_at && billingGateReason && (
            <EngagePaywall
              businessId={businessId}
              reason={billingGateReason}
              plans={(plans ?? []).map((p) => ({
                id: p.id,
                displayName: p.display_name,
                tier: p.tier,
                billingInterval: p.billing_interval as "monthly" | "annual",
                priceKobo: p.price_kobo,
                messageLimit: p.message_limit,
                escalationNotificationLimit: p.escalation_notification_limit,
                hasAnalytics: p.has_analytics,
              }))}
            />
          )}
          {business.plan_status === "active" && !billingGateReason && (
            <div style={{ margin: "0.5rem 0" }}>
              <p className="meta">
                Plan:{" "}
                {describePlanStatus(
                  {
                    planStatus: business.plan_status,
                    trialStartedAt: business.trial_started_at,
                    trialEndsAt: business.trial_ends_at,
                    currentPeriodEnd: business.current_period_end,
                  },
                  (plans ?? []).find((p) => p.id === business.plan_id)?.display_name ?? null,
                )}
              </p>
              <CancelSubscriptionButton businessId={businessId} />
            </div>
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
          {!instagramConnection.connected && !whatsappConnection.connected && !facebookConnection.connected && (
            <div
              style={{
                marginTop: "var(--s4)",
                padding: "var(--s5)",
                border: "1px solid var(--rule)",
                borderRadius: "var(--radius)",
                background: "var(--paper)",
              }}
            >
              <h3 className="h3">Connect a channel to start</h3>
              <p className="body" style={{ marginTop: "var(--s2)" }}>
                Engage can&apos;t receive or answer enquiries until at least one channel is connected.
                Instagram gives you a 30-day history baseline; WhatsApp and Facebook start fresh from the
                moment you connect — any of the three works. Instagram needs a Professional account —
                Business or Creator, not Personal —{" "}
                <Link href="/#faq">more in the FAQ →</Link>.
              </p>
              <div
                style={{
                  marginTop: "var(--s4)",
                  display: "flex",
                  gap: "var(--s4)",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <Link href="/api/channels/instagram/connect" className="btn btn--primary">
                  Connect Instagram →
                </Link>
                {whatsappConnection.canReconnect ? (
                  <ReconnectWhatsAppButton businessId={businessId} />
                ) : whatsappAppId && whatsappConfigId ? (
                  <ConnectWhatsAppButton appId={whatsappAppId} configId={whatsappConfigId} />
                ) : null}
                {facebookAppId && facebookConfigId ? (
                  <ConnectFacebookButton appId={facebookAppId} configId={facebookConfigId} />
                ) : null}
              </div>
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
                    <span style={{ display: "inline-flex", gap: "var(--s3)", alignItems: "center", flexWrap: "wrap" }}>
                      Connected{instagramConnection.username ? ` as @${instagramConnection.username}` : ""}
                      {/* Founder-caught 2026-09-08: a bare, unclassed
                          Link — easy to miss entirely, unlike WhatsApp's
                          own Reconnect (.btn--primary). .btn--secondary
                          here since a still-connected account refreshing
                          its token is lower-urgency than WhatsApp's
                          reconnect-a-dead-connection case. */}
                      <Link href="/api/channels/instagram/connect" className="btn btn--secondary">
                        Reconnect
                      </Link>
                      <DisconnectInstagramButton businessId={businessId} />
                    </span>
                  ) : (
                    "Not connected"
                  )}
                </td>
              </tr>
              <tr>
                <td>WhatsApp</td>
                <td>
                  {whatsappConnection.connected ? (
                    <span style={{ display: "inline-flex", gap: "var(--s3)", alignItems: "center", flexWrap: "wrap" }}>
                      Connected{whatsappConnection.phoneNumber ? ` — ${whatsappConnection.phoneNumber}` : ""}
                      <DisconnectWhatsAppButton businessId={businessId} />
                    </span>
                  ) : whatsappConnection.canReconnect ? (
                    <span style={{ display: "inline-flex", gap: "var(--s3)", alignItems: "center", flexWrap: "wrap" }}>
                      Not connected{whatsappConnection.phoneNumber ? ` — was ${whatsappConnection.phoneNumber}` : ""}
                      <ReconnectWhatsAppButton businessId={businessId} />
                    </span>
                  ) : whatsappAppId && whatsappConfigId ? (
                    <ConnectWhatsAppButton appId={whatsappAppId} configId={whatsappConfigId} />
                  ) : (
                    "Not available yet"
                  )}
                </td>
              </tr>
              <tr>
                <td>Facebook</td>
                <td>
                  {facebookConnection.connected ? (
                    <span style={{ display: "inline-flex", gap: "var(--s3)", alignItems: "center", flexWrap: "wrap" }}>
                      Connected{facebookConnection.pageName ? ` — ${facebookConnection.pageName}` : ""}
                      <DisconnectFacebookButton businessId={businessId} />
                    </span>
                  ) : facebookAppId && facebookConfigId ? (
                    <ConnectFacebookButton appId={facebookAppId} configId={facebookConfigId} />
                  ) : (
                    "Not available yet"
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          {/* Founder-caught 2026-09-08: these two — the actions a business
              owner actually uses day to day — were plain text links below
              Cancel subscription/Disconnect, which (bare `.btn` with no
              modifier, falling through to the browser's default gray
              button chrome, not a deliberate style) visually outweighed
              them despite being the rarer, higher-friction actions. Given
              real button styling and moved above the connection table;
              Cancel/Disconnect demoted to `.btn--ghost` below. */}
          <div style={{ display: "flex", gap: "var(--s3)", flexWrap: "wrap", marginTop: "var(--s4)" }}>
            <Link href="/dashboard/engage" className="btn btn--secondary">
              View conversations →
            </Link>
            <Link href="/dashboard/engage/knowledge" className="btn btn--secondary">
              Manage approved knowledge →
            </Link>
          </div>
          {!business.prevent_activated_at && <ActivateButton businessId={businessId} product="prevent" />}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: "var(--s7)" }}>
        <div className="panel__head">
          <h2 className="h3" style={{ margin: 0 }}>Incremental Revenue Influenced by Capture</h2>
        </div>
        <div className="panel__body">
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
        </div>
      </div>
    </main>
  );
}

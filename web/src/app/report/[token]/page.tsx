import Link from "next/link";
import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { generateRevenueLeakReport } from "@/lib/report/generate";
import { SiteNav, SiteFooter } from "@/components/SiteChrome";
import { InterestForm } from "./InterestForm";

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

export default async function ReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceRoleClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, report_viewed_at")
    .eq("upload_token", token)
    .maybeSingle();

  if (!business) {
    return (
      <div className="page">
        <SiteNav />
        <main>
          <div className="shell center-page">
            <h1 className="h2">Link not found</h1>
            <p className="body" style={{ marginTop: "var(--s4)" }}>
              This report link is invalid. Please contact us to get a new one.
            </p>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  // Rough, honest proxy for "report engagement" (PRD §44) — first render
  // only, after the response so it never delays the page. Can't
  // distinguish a real business view from the founder/a test hitting the
  // same token — see OUTSTANDINGS.md.
  if (!business.report_viewed_at) {
    after(async () => {
      await supabase
        .from("businesses")
        .update({ report_viewed_at: new Date().toISOString() })
        .eq("id", business.id);
    });
  }

  const [{ data: conversations }, { data: opportunities }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, leakage_type, classified_at, classification_notes")
      .eq("business_id", business.id),
    supabase.from("opportunities").select("estimated_value").eq("business_id", business.id),
  ]);

  if (!conversations || conversations.length === 0) {
    return (
      <div className="page">
        <SiteNav />
        <main>
          <div className="shell center-page">
            <h1 className="h2">No conversations yet</h1>
            <p className="body" style={{ marginTop: "var(--s4)" }}>
              We haven&apos;t received any conversations for {business.name} yet.
            </p>
            <Link href={`/upload/${token}`} className="btn btn--primary" style={{ marginTop: "var(--s5)" }}>
              Upload conversations
            </Link>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const report = generateRevenueLeakReport(conversations, opportunities ?? []);
  const stillAnalysing = report.classifiedConversations < report.totalConversations;
  const leaks = Object.entries(report.leakageCounts).filter(([, count]) => count > 0);

  return (
    <div className="page">
      <SiteNav />

      <main>
        <div className="shell band">
          <div className="report">
            {/* --------------------------------------------- headline --- */}
            <header className="report__head">
              <p className="step">
                <span>Revenue Leak Report</span>
                <span className="step__line" />
              </p>
              <h1 className="display" style={{ fontSize: "clamp(2rem, 4.4vw, 3.25rem)" }}>
                {business.name}
              </h1>
              <p className="lede" style={{ marginTop: "var(--s4)" }}>
                {report.classifiedConversations} of {report.totalConversations} conversation
                {report.totalConversations === 1 ? "" : "s"} analysed
                {stillAnalysing ? " so far — refresh in a moment for the rest." : "."}
              </p>
            </header>

            {/* ------------------------------------ the headline number --- */}
            {report.hasAnyValueEstimate && (
              <section className="report__figure">
                <span className="meta">Estimated opportunity value</span>
                <p className="mono realised report__figure-value">
                  {formatNaira(report.estimatedOpportunityValue ?? 0)}
                </p>
                <p className="meta" style={{ maxWidth: "44ch" }}>
                  Estimated opportunity value is not a revenue guarantee.
                </p>
              </section>
            )}

            {/* ----------------------------------------- what we found --- */}
            <section className="report__block">
              <h2 className="h3">What we found</h2>
              {report.totalLeaks === 0 ? (
                <p className="body" style={{ marginTop: "var(--s4)" }}>
                  No meaningful revenue leakage in the conversations analysed so far.
                </p>
              ) : (
                <div className="surface" style={{ marginTop: "var(--s4)" }}>
                  <div className="panel__body">
                    {leaks.map(([type, count]) => (
                      <div className="stat-row" key={type}>
                        <span className="stat-row__label">{LEAK_LABELS[type] ?? type}</span>
                        <span className="stat-row__value dormant">{count}</span>
                      </div>
                    ))}
                    <div className="stat-row stat-row--lead">
                      <span className="stat-row__label">Potentially recoverable</span>
                      <span className="stat-row__value">
                        {report.totalLeaks} of {report.classifiedConversations}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* ---------------------------------------------- score ------ */}
            <section className="report__block">
              <h2 className="h3">Revenue Readiness Score</h2>
              <p className="meta" style={{ marginTop: "var(--s2)", maxWidth: "52ch" }}>
                A communication device, not a predictive model — how consistently enquiries get a
                response, a follow-up, and a second chance.
              </p>
              <div className="surface" style={{ marginTop: "var(--s4)" }}>
                <div className="panel__body">
                  <div className="stat-row stat-row--lead">
                    <span className="stat-row__label">Overall</span>
                    <span className="stat-row__value">{report.readinessScore.overall}/100</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row__label">Response</span>
                    <span className="stat-row__value">{report.readinessScore.response}/100</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row__label">Follow-up</span>
                    <span className="stat-row__value">{report.readinessScore.followUp}/100</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row__label">Recovery</span>
                    <span className="stat-row__value">{report.readinessScore.recovery}/100</span>
                  </div>
                </div>
              </div>
            </section>

            {/* -------------------------------------------- examples ----- */}
            {report.examples.length > 0 && (
              <section className="report__block">
                <h2 className="h3">Examples</h2>
                <p className="meta" style={{ marginTop: "var(--s2)" }}>
                  Anonymised — no customer names or contact details.
                </p>
                <ul className="flow" style={{ marginTop: "var(--s5)" }}>
                  {report.examples.map((ex) => (
                    <li className="flow__step flow__step--dormant" key={ex.leakageType}>
                      <span className="flow__marker" aria-hidden="true">
                        <span className="flow__dot" />
                      </span>
                      <span>
                        <span className="flow__label">
                          {LEAK_LABELS[ex.leakageType] ?? ex.leakageType}
                        </span>
                        <span className="flow__note" style={{ display: "block" }}>
                          {ex.note}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ------------------------------------------------- next ---- */}
            <section className="report__cta">
              <h2 className="h2">Find it → recover it → prevent it.</h2>
              <p className="body" style={{ marginTop: "var(--s4)" }}>
                This report is the diagnosis. What would help most right now?
              </p>
              <div style={{ marginTop: "var(--s5)" }}>
                <InterestForm token={token} />
              </div>
              <p className="meta" style={{ marginTop: "var(--s6)" }}>
                <Link href={`/signup?claim=${token}`} className="link">
                  Create your free account
                </Link>{" "}
                to track recovery progress and set up automated responses.
              </p>
            </section>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

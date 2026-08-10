import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { generateRevenueLeakReport } from "@/lib/report/generate";
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
      <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "sans-serif" }}>
        <h1>Link not found</h1>
        <p>This report link is invalid. Please contact us to get a new one.</p>
      </main>
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
      <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "sans-serif" }}>
        <h1>No conversations yet</h1>
        <p>We haven&apos;t received any conversations for {business.name} yet.</p>
      </main>
    );
  }

  const report = generateRevenueLeakReport(conversations, opportunities ?? []);
  const stillAnalysing = report.classifiedConversations < report.totalConversations;

  return (
    <main style={{ maxWidth: 640, margin: "3rem auto", fontFamily: "sans-serif", lineHeight: 1.6 }}>
      <h1>Revenue Leak Report</h1>
      <p>
        For <strong>{business.name}</strong> — {report.classifiedConversations} of {report.totalConversations}{" "}
        conversation(s) analysed{stillAnalysing ? " so far (more still being classified)" : ""}.
      </p>

      <section style={{ margin: "2rem 0" }}>
        <h2>
          Capture Revenue Readiness Score: {report.readinessScore.overall}/100
        </h2>
        <p style={{ fontSize: "0.9rem", color: "#666" }}>
          A simple communication device, not a predictive model — it summarises how consistently
          enquiries get a response, get followed up, and get recovered.
        </p>
        <ul>
          <li>Response: {report.readinessScore.response}/100</li>
          <li>Follow-up: {report.readinessScore.followUp}/100</li>
          <li>Recovery: {report.readinessScore.recovery}/100</li>
        </ul>
      </section>

      <section style={{ margin: "2rem 0" }}>
        <h2>What we found</h2>
        {report.totalLeaks === 0 ? (
          <p>No meaningful revenue leakage found in the conversations analysed so far.</p>
        ) : (
          <ul>
            {Object.entries(report.leakageCounts)
              .filter(([, count]) => count > 0)
              .map(([type, count]) => (
                <li key={type}>
                  {count} {LEAK_LABELS[type] ?? type}
                </li>
              ))}
          </ul>
        )}
        <p>
          <strong>{report.totalLeaks} potentially recoverable conversation(s)</strong> out of{" "}
          {report.classifiedConversations} analysed.
        </p>
      </section>

      {report.hasAnyValueEstimate && (
        <section style={{ margin: "2rem 0" }}>
          <h2>Estimated opportunity value</h2>
          <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            {formatNaira(report.estimatedOpportunityValue ?? 0)}
          </p>
          <p style={{ fontSize: "0.85rem", color: "#666" }}>
            Estimated opportunity value is not a revenue guarantee.
          </p>
        </section>
      )}

      {report.examples.length > 0 && (
        <section style={{ margin: "2rem 0" }}>
          <h2>Examples</h2>
          <p style={{ fontSize: "0.85rem", color: "#666" }}>
            Anonymised — no customer names or contact details.
          </p>
          <ul>
            {report.examples.map((ex) => (
              <li key={ex.leakageType}>
                <strong>{LEAK_LABELS[ex.leakageType] ?? ex.leakageType}:</strong> {ex.note}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={{ margin: "2rem 0", paddingTop: "1.5rem", borderTop: "1px solid #333" }}>
        <h2>Find what you&apos;re losing → recover what you can → prevent future leakage.</h2>
        <p>This report is the first step. What would help most right now?</p>
        <InterestForm token={token} />
      </section>
    </main>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeNorthStar } from "@/lib/report/north-star";

// Deliberately queries via the authenticated server client, NOT the
// service-role client used elsewhere in this app for public/token-gated
// writes. This is the first place in the app that reads tenant-scoped data
// as a real authenticated user — it exercises RLS for real (platform_admins
// see every business; anyone else sees none, per
// supabase/migrations/20260810000001_harden_rls.sql's `businesses_select`
// policy), closing out the "re-verify RLS with a real Supabase Auth
// session" item noted since Phase 1.1.
export default async function AdminPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  const { data: businesses } = await supabase
    .from("businesses")
    .select(
      "id, name, industry, created_at, report_viewed_at, interested_in_recover, interested_in_prevent, is_simulated",
    )
    .order("created_at", { ascending: false });

  if (!businesses || businesses.length === 0) {
    return (
      <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "sans-serif" }}>
        <h1>Capture — Admin</h1>
        <p>Signed in as {claims?.claims.email ?? "unknown"}.</p>
        <p>
          No businesses visible to this account. Either none exist yet, or this account isn&apos;t
          in <code>platform_admins</code> / <code>business_members</code> — RLS denies by default,
          not an error.
        </p>
      </main>
    );
  }

  const businessIds = businesses.map((b) => b.id);
  // North Star (PRD §45) is a real-revenue metric — simulated fixtures
  // (OUTSTANDINGS.md DEV-1) are excluded so a founder can't mistake fixture
  // data for real influenced revenue.
  const realBusinessIds = businesses.filter((b) => !b.is_simulated).map((b) => b.id);
  const [{ data: conversations }, { data: allOpportunities }] = await Promise.all([
    supabase.from("conversations").select("id, business_id, classified_at, source").in("business_id", businessIds),
    realBusinessIds.length
      ? supabase.from("opportunities").select("status, actual_revenue").in("business_id", realBusinessIds)
      : Promise.resolve({ data: [] as { status: string; actual_revenue: number | null }[] }),
  ]);

  // "Messages handled" counts Prevent conversations only — the uploaded Find
  // history is messages the business handled itself before Capture existed.
  // See lib/report/north-star.ts.
  const realBusinessIdSet = new Set(realBusinessIds);
  const preventConvIds = (conversations ?? [])
    .filter((c) => c.source === "whatsapp_api" && realBusinessIdSet.has(c.business_id))
    .map((c) => c.id);
  const { count: handledMessagesCount } = preventConvIds.length
    ? await supabase.from("messages").select("id", { count: "exact", head: true }).in("conversation_id", preventConvIds)
    : { count: 0 };
  const northStar = computeNorthStar(handledMessagesCount ?? 0, allOpportunities ?? []);

  const conversationCounts = new Map<string, { total: number; classified: number }>();
  for (const c of conversations ?? []) {
    const entry = conversationCounts.get(c.business_id) ?? { total: 0, classified: 0 };
    entry.total++;
    if (c.classified_at) entry.classified++;
    conversationCounts.set(c.business_id, entry);
  }

  // PRD §44 Find funnel metrics — deliberately simple ratios over what's
  // visible to this account (all businesses, for a platform admin).
  const totalAudits = businesses.length;
  const uploadedCount = businesses.filter((b) => (conversationCounts.get(b.id)?.total ?? 0) > 0).length;
  const totalConversations = [...conversationCounts.values()].reduce((s, c) => s + c.total, 0);
  const totalClassified = [...conversationCounts.values()].reduce((s, c) => s + c.classified, 0);
  const reportViewedCount = businesses.filter((b) => b.report_viewed_at).length;
  const interestedCount = businesses.filter((b) => b.interested_in_recover || b.interested_in_prevent).length;

  const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((100 * n) / d)}%`);

  return (
    <main style={{ maxWidth: 900, margin: "3rem auto", fontFamily: "sans-serif" }}>
      <h1>Capture — Admin</h1>
      <p>Signed in as {claims?.claims.email ?? "unknown"}.</p>

      <section style={{ margin: "2rem 0" }}>
        <h2>Find funnel</h2>
        <table style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Audits started (intake completed)</td>
              <td>{totalAudits}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Upload completion</td>
              <td>
                {uploadedCount} / {totalAudits} ({pct(uploadedCount, totalAudits)})
              </td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Analysis completion (conversations classified)</td>
              <td>
                {totalClassified} / {totalConversations} ({pct(totalClassified, totalConversations)})
              </td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Report engagement</td>
              <td>
                {reportViewedCount} / {totalAudits} ({pct(reportViewedCount, totalAudits)})
              </td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Audit → product interest</td>
              <td>
                {interestedCount} / {totalAudits} ({pct(interestedCount, totalAudits)})
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={{ margin: "2rem 0" }}>
        <h2>North Star — Incremental Revenue Influenced by Capture</h2>
        <p style={{ fontSize: "0.85rem", color: "#666" }}>
          PRD §45. Real (non-simulated) businesses only. Messages handled → opportunities identified →
          opportunities recovered → revenue recovered → revenue protected/generated (Prevent leg not tracked in
          V1).
        </p>
        <table style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Messages handled</td>
              <td>{northStar.messagesHandled}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Opportunities identified</td>
              <td>{northStar.opportunitiesIdentified}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Opportunities recovered</td>
              <td>{northStar.opportunitiesRecovered}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0", fontWeight: 700 }}>
                Incremental revenue influenced
              </td>
              <td style={{ fontWeight: 700 }}>
                ₦{Math.round(northStar.incrementalRevenueInfluenced).toLocaleString("en-NG")}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Businesses</h2>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
              <th style={{ padding: "0.4rem" }}>Business</th>
              <th style={{ padding: "0.4rem" }}>Industry</th>
              <th style={{ padding: "0.4rem" }}>Created</th>
              <th style={{ padding: "0.4rem" }}>Conversations</th>
              <th style={{ padding: "0.4rem" }}>Classified</th>
              <th style={{ padding: "0.4rem" }}>Report viewed</th>
              <th style={{ padding: "0.4rem" }}>Interest</th>
              <th style={{ padding: "0.4rem" }}></th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((b) => {
              const counts = conversationCounts.get(b.id) ?? { total: 0, classified: 0 };
              const interests = [b.interested_in_recover && "Recover", b.interested_in_prevent && "Prevent"]
                .filter(Boolean)
                .join(", ");
              return (
                <tr key={b.id} style={{ borderBottom: "1px solid #222" }}>
                  <td style={{ padding: "0.4rem" }}>
                    {b.name}
                    {b.is_simulated && <span style={{ color: "#888" }}> (simulated)</span>}
                  </td>
                  <td style={{ padding: "0.4rem" }}>{b.industry ?? "—"}</td>
                  <td style={{ padding: "0.4rem" }}>{new Date(b.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: "0.4rem" }}>{counts.total}</td>
                  <td style={{ padding: "0.4rem" }}>{counts.classified}</td>
                  <td style={{ padding: "0.4rem" }}>{b.report_viewed_at ? "Yes" : "No"}</td>
                  <td style={{ padding: "0.4rem" }}>{interests || "—"}</td>
                  <td style={{ padding: "0.4rem" }}>
                    <Link href={`/admin/recover/${b.id}`}>Recover →</Link>{" "}
                    <Link href={`/admin/prevent/${b.id}`}>Prevent →</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}

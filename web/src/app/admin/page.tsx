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
      <main className="shell app-page">
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
    <main className="shell app-page">
      <h1>Capture — Admin</h1>
      <p>Signed in as {claims?.claims.email ?? "unknown"}.</p>

      <section style={{ margin: "2rem 0" }}>
        <h2>Find funnel</h2>
        <table className="table">
          <tbody>
            <tr>
              <td >Audits started (intake completed)</td>
              <td>{totalAudits}</td>
            </tr>
            <tr>
              <td >Upload completion</td>
              <td>
                {uploadedCount} / {totalAudits} ({pct(uploadedCount, totalAudits)})
              </td>
            </tr>
            <tr>
              <td >Analysis completion (conversations classified)</td>
              <td>
                {totalClassified} / {totalConversations} ({pct(totalClassified, totalConversations)})
              </td>
            </tr>
            <tr>
              <td >Report engagement</td>
              <td>
                {reportViewedCount} / {totalAudits} ({pct(reportViewedCount, totalAudits)})
              </td>
            </tr>
            <tr>
              <td >Audit → product interest</td>
              <td>
                {interestedCount} / {totalAudits} ({pct(interestedCount, totalAudits)})
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={{ margin: "2rem 0" }}>
        <h2>North Star — Incremental Revenue Influenced by Capture</h2>
        <p className="meta">
          PRD §45. Real (non-simulated) businesses only. Messages handled → opportunities identified →
          opportunities recovered → revenue recovered → revenue protected/generated (Prevent leg not tracked in
          V1).
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
              <td >
                Incremental revenue influenced
              </td>
              <td >
                ₦{Math.round(northStar.incrementalRevenueInfluenced).toLocaleString("en-NG")}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Businesses</h2>
        <table className="table">
          <thead>
            <tr >
              <th >Business</th>
              <th >Industry</th>
              <th >Created</th>
              <th >Conversations</th>
              <th >Classified</th>
              <th >Report viewed</th>
              <th >Interest</th>
              <th ></th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((b) => {
              const counts = conversationCounts.get(b.id) ?? { total: 0, classified: 0 };
              const interests = [b.interested_in_recover && "Recover", b.interested_in_prevent && "Prevent"]
                .filter(Boolean)
                .join(", ");
              return (
                <tr key={b.id} >
                  <td >
                    {b.name}
                    {b.is_simulated && <span className="meta"> (simulated)</span>}
                  </td>
                  <td >{b.industry ?? "—"}</td>
                  <td >{new Date(b.created_at).toLocaleDateString()}</td>
                  <td >{counts.total}</td>
                  <td >{counts.classified}</td>
                  <td >{b.report_viewed_at ? "Yes" : "No"}</td>
                  <td >{interests || "—"}</td>
                  <td >
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

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnBusinessId } from "@/lib/business-membership";
import { computeRecoverSummary } from "@/lib/recover/summary";
import { computePreventSummary } from "@/lib/prevent/summary";
import { computeNorthStar } from "@/lib/report/north-star";
import { ActivateButton } from "./ActivateButton";

function formatNaira(value: number): string {
  return `₦${Math.round(value).toLocaleString("en-NG")}`;
}

// The self-service home for a business owner — Phase 4 "standardised
// onboarding across Find/Recover/Prevent" continues here: one place a
// business checks all three products, rather than only ever seeing them
// through founder-run /admin. Detailed campaign/conversation actions still
// live at /admin/recover/[id] and /admin/prevent/[id] — RLS already permits
// a business's own member there (is_business_member doesn't distinguish
// "admin route" from "business route", only membership), this page links
// into them rather than re-implementing their tables.
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login?next=/dashboard");

  const userId = claims.claims.sub as string;
  const businessId = await getOwnBusinessId(supabase, userId);
  if (!businessId) redirect("/onboarding");

  const { data: business } = await supabase
    .from("businesses")
    .select(
      "id, name, industry, upload_token, onboarded_at, recover_activated_at, prevent_activated_at",
    )
    .eq("id", businessId)
    .maybeSingle();

  if (!business) redirect("/onboarding");

  const [
    { data: opportunities },
    { data: findConversations },
    { data: preventConversations },
    { count: knowledgeCount },
    { count: messagesCount },
  ] = await Promise.all([
    supabase.from("opportunities").select("status, actual_revenue").eq("business_id", businessId),
    supabase.from("conversations").select("id").eq("business_id", businessId).eq("source", "manual_export").limit(1),
    supabase
      .from("conversations")
      .select("id, escalated_at, qualification, ai_followup_count")
      .eq("business_id", businessId)
      .eq("source", "whatsapp_api"),
    supabase.from("knowledge_items").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("business_id", businessId),
  ]);

  const preventConvs = preventConversations ?? [];
  const preventConvIds = preventConvs.map((c) => c.id);
  const { data: aiMessages } = preventConvIds.length
    ? await supabase.from("messages").select("conversation_id").eq("sender_type", "ai").in("conversation_id", preventConvIds)
    : { data: [] };
  const answeredIds = new Set((aiMessages ?? []).map((m) => m.conversation_id));

  const recover = computeRecoverSummary(opportunities ?? []);
  const prevent = computePreventSummary(preventConvs, answeredIds);
  const northStar = computeNorthStar(messagesCount ?? 0, opportunities ?? []);

  const hasFindData = (findConversations?.length ?? 0) > 0;

  return (
    <main style={{ maxWidth: 900, margin: "3rem auto", fontFamily: "sans-serif" }}>
      <h1>{business.name}</h1>
      <p style={{ color: "#888" }}>
        {business.industry ?? "No industry set"} · <Link href="/dashboard/settings">Configure rules →</Link>
      </p>

      <section style={{ margin: "1.5rem 0" }}>
        <h2>Find</h2>
        {hasFindData ? (
          <p>
            <Link href={`/report/${business.upload_token}`}>View your Revenue Leak Report →</Link>
          </p>
        ) : (
          <p>
            No conversations uploaded yet.{" "}
            <Link href={`/upload/${business.upload_token}`}>Upload WhatsApp conversations →</Link>
          </p>
        )}
      </section>

      <section style={{ margin: "1.5rem 0" }}>
        <h2>Recover {business.recover_activated_at ? "· Active" : "· Not activated"}</h2>
        <table style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Opportunities identified</td>
              <td>{recover.identified}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Contacted</td>
              <td>{recover.contacted}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0", fontWeight: 700 }}>Revenue recovered</td>
              <td style={{ fontWeight: 700 }}>{formatNaira(recover.revenueRecovered)}</td>
            </tr>
          </tbody>
        </table>
        <p>
          <Link href={`/admin/recover/${businessId}`}>Manage campaign →</Link>
        </p>
        {!business.recover_activated_at && <ActivateButton businessId={businessId} product="recover" />}
      </section>

      <section style={{ margin: "1.5rem 0" }}>
        <h2>Prevent {business.prevent_activated_at ? "· Active" : "· Not activated"}</h2>
        <table style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Enquiries received</td>
              <td>{prevent.enquiriesReceived}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Enquiries answered</td>
              <td>{prevent.enquiriesAnswered}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Human handoffs</td>
              <td>{prevent.humanHandoffs}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Approved knowledge items</td>
              <td>{knowledgeCount ?? 0}</td>
            </tr>
          </tbody>
        </table>
        <p>
          <Link href={`/admin/prevent/${businessId}`}>View conversations →</Link> ·{" "}
          <Link href={`/admin/prevent/${businessId}/knowledge`}>Manage approved knowledge →</Link>
        </p>
        {!business.prevent_activated_at && <ActivateButton businessId={businessId} product="prevent" />}
      </section>

      <section style={{ margin: "1.5rem 0", paddingTop: "1.5rem", borderTop: "1px solid #333" }}>
        <h2>Incremental Revenue Influenced by Capture</h2>
        <p style={{ fontSize: "0.85rem", color: "#666" }}>
          Messages handled → opportunities identified → opportunities recovered → revenue recovered → revenue
          protected/generated. Only the Recover leg is measurable today.
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
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Revenue protected/generated (Prevent)</td>
              <td style={{ color: "#888" }}>Not tracked in V1</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0", fontWeight: 700 }}>
                Incremental revenue influenced
              </td>
              <td style={{ fontWeight: 700 }}>{formatNaira(northStar.incrementalRevenueInfluenced)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}

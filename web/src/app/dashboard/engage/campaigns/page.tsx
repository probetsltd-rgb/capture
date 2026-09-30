import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnBusinessId } from "@/lib/business-membership";

function pct(part: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

// Real, measurable funnel numbers only — no invented "conversion" figure,
// same discipline as the homepage's own "only numbers we can actually
// measure" line. "Replied" and "reached your team" are the two honest
// signals this data actually supports: did the customer say anything back
// after the trigger, and did the conversation end up needing a human.
export default async function CampaignPerformancePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login?next=/dashboard/engage/campaigns");

  const userId = claims.claims.sub as string;
  const businessId = await getOwnBusinessId(supabase, userId);
  if (!businessId) redirect("/dashboard");

  const { data: campaignConversations } = await supabase
    .from("conversations")
    .select("id, campaign_source, escalated_at")
    .eq("business_id", businessId)
    .not("campaign_source", "is", null);

  const conversationIds = (campaignConversations ?? []).map((c) => c.id as string);
  const { data: customerMessages } =
    conversationIds.length > 0
      ? await supabase.from("messages").select("conversation_id").eq("sender_type", "customer").in("conversation_id", conversationIds)
      : { data: [] as { conversation_id: string }[] };

  const customerMessageCounts = new Map<string, number>();
  for (const m of customerMessages ?? []) {
    customerMessageCounts.set(m.conversation_id, (customerMessageCounts.get(m.conversation_id) ?? 0) + 1);
  }

  type Stat = { campaignName: string; triggered: number; replied: number; escalated: number };
  const statsByName = new Map<string, Stat>();
  for (const conv of campaignConversations ?? []) {
    const name = conv.campaign_source as string;
    const stat = statsByName.get(name) ?? { campaignName: name, triggered: 0, replied: 0, escalated: 0 };
    stat.triggered++;
    // "Replied" means the customer sent something beyond the trigger word
    // itself — more than one customer-sent message in the conversation.
    if ((customerMessageCounts.get(conv.id as string) ?? 0) > 1) stat.replied++;
    if (conv.escalated_at) stat.escalated++;
    statsByName.set(name, stat);
  }
  const stats = Array.from(statsByName.values()).sort((a, b) => b.triggered - a.triggered);

  return (
    <main className="shell app-page">
      <p>
        <Link href="/dashboard/settings">← Back to Settings</Link>
      </p>
      <h1>Campaign performance</h1>
      <p className="meta">
        Every conversation that started with one of your campaign keywords, and how far it actually got. Only
        numbers we can actually measure — no invented conversion rate.
      </p>

      {stats.length === 0 ? (
        <p className="meta" style={{ marginTop: "var(--s5)" }}>
          No campaign-triggered conversations yet. Add a campaign keyword on the{" "}
          <Link href="/dashboard/settings">Settings</Link> page, then check back once your campaign is live.
        </p>
      ) : (
        <table className="table" style={{ marginTop: "var(--s5)" }}>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Triggered</th>
              <th>Replied</th>
              <th>Reached your team</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.campaignName}>
                <td>{s.campaignName}</td>
                <td>{s.triggered}</td>
                <td>
                  {s.replied} ({pct(s.replied, s.triggered)})
                </td>
                <td>
                  {s.escalated} ({pct(s.escalated, s.triggered)})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

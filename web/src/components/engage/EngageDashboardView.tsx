import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computePreventSummary } from "@/lib/prevent/summary";
import { SimulateForm } from "./SimulateForm";
import { ConversationRow } from "./ConversationRow";

// Shared body for both /admin/engage/[businessId] (founder, explicit
// businessId) and /dashboard/engage (business owner, own businessId from
// session) — extracted 2026-08-15 during the Prevent→Engage rename and
// route restructure (PLANS.md Phase 5.0), so a business owner reachable
// via the exact same "View conversations →" link no longer lands on a URL
// and page that literally says "admin" (a real, founder-caught gap — see
// OUTSTANDINGS.md). Data access is unaffected either way — both routes
// still go through the authenticated, RLS-governed client, this only
// changes the URL and the surrounding chrome (back-link, page title).
export async function EngageDashboardView({
  businessId,
  backHref,
  backLabel,
  knowledgeHref,
}: {
  businessId: string;
  backHref: string;
  backLabel: string;
  knowledgeHref: string;
}) {
  const supabase = await createClient();

  const { data: business } = await supabase.from("businesses").select("id, name").eq("id", businessId).maybeSingle();
  if (!business) {
    return (
      <main className="shell app-page">
        <h1>Not found</h1>
        <p>No business visible with this ID.</p>
      </main>
    );
  }

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, state, escalation_reason, escalated_at, assigned_to, qualification, ai_followup_count, customer_id")
    .eq("business_id", businessId)
    // whatsapp_api + instagram_api — excludes Find's uploaded historical
    // exports (source: manual_export). instagram_api added 2026-08-15 after
    // this filter silently hid a real, live-received Instagram conversation
    // from its own business owner.
    .in("source", ["whatsapp_api", "instagram_api"])
    // Most recent real activity first, not row-insertion order — a
    // conversation created during the historical import but receiving
    // brand-new live messages today should surface near the top, not stay
    // buried at its original import position. `last_message_at` is null
    // for a handful of edge-case rows with zero messages; those sort last,
    // not first, same `nullsFirst: false` convention already used in
    // `findOrCreateConversationForInboundMessage` (lib/channels/instagram.ts).
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const { data: customers } = await supabase.from("customers").select("id, name").eq("business_id", businessId);
  const customerNameById = new Map((customers ?? []).map((c) => [c.id, c.name]));

  const convs = conversations ?? [];
  const conversationIds = convs.map((c) => c.id);
  const { data: aiMessages } = conversationIds.length
    ? await supabase.from("messages").select("conversation_id").eq("sender_type", "ai").in("conversation_id", conversationIds)
    : { data: [] };
  const answeredConversationIds = new Set((aiMessages ?? []).map((m) => m.conversation_id));

  // Founder-caught 2026-08-15, filed then, fixed now (OUTSTANDINGS.md
  // "Escalation Row Missing Message Content"): the row showed state and an
  // escalation reason but never what the customer actually said — a human
  // deciding whether to take a conversation had no way to see what they'd
  // be taking over without a direct DB query. Fetched once here (not
  // per-row) and grouped client-side, same batching discipline as the
  // aiMessages query above — at Rentit's real current scale (42
  // conversations / 281 messages, TESTS.md 2026-08-15) this is a single
  // small query, not a per-row N+1.
  const { data: allMessages } = conversationIds.length
    ? await supabase
        .from("messages")
        .select("conversation_id, sender_type, body, sent_at")
        .in("conversation_id", conversationIds)
        .order("sent_at", { ascending: true })
    : { data: [] };
  const messagesByConversation = new Map<string, { sender_type: string; body: string | null; sent_at: string }[]>();
  for (const m of allMessages ?? []) {
    const list = messagesByConversation.get(m.conversation_id) ?? [];
    list.push(m);
    messagesByConversation.set(m.conversation_id, list);
  }
  const { enquiriesReceived, enquiriesAnswered, qualifiedLeads, humanHandoffs, followUpsSent } =
    computePreventSummary(convs, answeredConversationIds);

  return (
    <main className="shell app-page">
      <p>
        <Link href={backHref}>{backLabel}</Link> · <Link href={knowledgeHref}>Manage approved knowledge →</Link>
      </p>
      <h1>Engage — {business.name}</h1>

      <section >
        <h2>Dashboard</h2>
        <table className="table">
          <tbody>
            <tr>
              <td >Enquiries received</td>
              <td>{enquiriesReceived}</td>
            </tr>
            <tr>
              <td >Enquiries answered</td>
              <td>{enquiriesAnswered}</td>
            </tr>
            <tr>
              <td >Qualified leads</td>
              <td>{qualifiedLeads}</td>
            </tr>
            <tr>
              <td >Human handoffs</td>
              <td>{humanHandoffs}</td>
            </tr>
            <tr>
              <td >Follow-ups sent</td>
              <td>{followUpsSent}</td>
            </tr>
            <tr>
              <td >Conversions/revenue</td>
              <td className="meta">Not yet tracked</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section >
        <h2>Simulate an inbound message</h2>
        <p className="meta">
          Test the response engine without a real customer message — Instagram is now live if connected on the
          dashboard; this remains a stand-in for WhatsApp, which isn&apos;t connected yet.
        </p>
        <SimulateForm businessId={businessId} />
      </section>

      <section>
        <h2>Conversations</h2>
        <div className="table__scroll">
        <table className="table">
          <thead>
            <tr >
              <th >Customer</th>
              <th >State</th>
              <th >Action</th>
            </tr>
          </thead>
          <tbody>
            {convs.map((c) => (
              <tr key={c.id} >
                <td >{customerNameById.get(c.customer_id) ?? "—"}</td>
                <td >{c.state}</td>
                <td >
                  <ConversationRow
                    businessId={businessId}
                    conversationId={c.id}
                    state={c.state}
                    escalationReason={c.escalation_reason}
                    assignedTo={c.assigned_to}
                    messages={messagesByConversation.get(c.id) ?? []}
                  />
                </td>
              </tr>
            ))}
            {convs.length === 0 && (
              <tr>
                <td colSpan={3} className="meta">
                  No conversations yet — simulate one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </section>
    </main>
  );
}

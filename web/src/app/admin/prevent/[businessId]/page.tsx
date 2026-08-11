import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computePreventSummary } from "@/lib/prevent/summary";
import { SimulateForm } from "./SimulateForm";
import { ConversationRow } from "./ConversationRow";

export default async function PreventPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
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
    .eq("source", "whatsapp_api") // Prevent-originated only — excludes Find's uploaded historical exports
    .order("created_at", { ascending: false });

  const { data: customers } = await supabase.from("customers").select("id, name").eq("business_id", businessId);
  const customerNameById = new Map((customers ?? []).map((c) => [c.id, c.name]));

  const convs = conversations ?? [];
  const conversationIds = convs.map((c) => c.id);
  const { data: aiMessages } = conversationIds.length
    ? await supabase.from("messages").select("conversation_id").eq("sender_type", "ai").in("conversation_id", conversationIds)
    : { data: [] };
  const answeredConversationIds = new Set((aiMessages ?? []).map((m) => m.conversation_id));
  const { enquiriesReceived, enquiriesAnswered, qualifiedLeads, humanHandoffs, followUpsSent } =
    computePreventSummary(convs, answeredConversationIds);

  return (
    <main className="shell app-page">
      <p>
        <Link href="/admin">← Back to admin</Link> · <Link href={`/admin/prevent/${businessId}/knowledge`}>Manage approved knowledge →</Link>
      </p>
      <h1>Prevent — {business.name}</h1>

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
              <td className="meta">Not tracked in V1 — see PLANS.md</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section >
        <h2>Simulate an inbound message</h2>
        <p className="meta">
          Stand-in for a live WhatsApp/Instagram connection, which isn&apos;t available yet.
        </p>
        <SimulateForm businessId={businessId} />
      </section>

      <section>
        <h2>Conversations</h2>
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
      </section>
    </main>
  );
}

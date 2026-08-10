import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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
      <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "sans-serif" }}>
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
  const enquiriesReceived = convs.length;
  const conversationIds = convs.map((c) => c.id);
  const { data: aiMessages } = conversationIds.length
    ? await supabase.from("messages").select("conversation_id").eq("sender_type", "ai").in("conversation_id", conversationIds)
    : { data: [] };
  const answeredConversationIds = new Set((aiMessages ?? []).map((m) => m.conversation_id));
  const enquiriesAnswered = answeredConversationIds.size;
  const humanHandoffs = convs.filter((c) => c.escalated_at !== null).length;
  const qualifiedLeads = convs.filter((c) => c.qualification && Object.keys(c.qualification).length > 0).length;
  const followUpsSent = convs.reduce((sum, c) => sum + (c.ai_followup_count ?? 0), 0);

  return (
    <main style={{ maxWidth: 900, margin: "3rem auto", fontFamily: "sans-serif" }}>
      <p>
        <Link href="/admin">← Back to admin</Link> · <Link href={`/admin/prevent/${businessId}/knowledge`}>Manage approved knowledge →</Link>
      </p>
      <h1>Prevent — {business.name}</h1>

      <section style={{ margin: "1.5rem 0" }}>
        <h2>Dashboard</h2>
        <table style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Enquiries received</td>
              <td>{enquiriesReceived}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Enquiries answered</td>
              <td>{enquiriesAnswered}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Qualified leads</td>
              <td>{qualifiedLeads}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Human handoffs</td>
              <td>{humanHandoffs}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Follow-ups sent</td>
              <td>{followUpsSent}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>Conversions/revenue</td>
              <td style={{ color: "#888" }}>Not tracked in V1 — see PLANS.md</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={{ margin: "1.5rem 0" }}>
        <h2>Simulate an inbound message</h2>
        <p style={{ fontSize: "0.85rem", color: "#888" }}>
          Stand-in for a live WhatsApp/Instagram connection, which isn&apos;t available yet.
        </p>
        <SimulateForm businessId={businessId} />
      </section>

      <section>
        <h2>Conversations</h2>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
              <th style={{ padding: "0.4rem" }}>Customer</th>
              <th style={{ padding: "0.4rem" }}>State</th>
              <th style={{ padding: "0.4rem" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {convs.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #222" }}>
                <td style={{ padding: "0.4rem" }}>{customerNameById.get(c.customer_id) ?? "—"}</td>
                <td style={{ padding: "0.4rem" }}>{c.state}</td>
                <td style={{ padding: "0.4rem" }}>
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
                <td colSpan={3} style={{ padding: "0.4rem", color: "#888" }}>
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

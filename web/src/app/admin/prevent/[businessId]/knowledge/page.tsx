import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { KnowledgeForm } from "./KnowledgeForm";
import { DeleteButton } from "./DeleteButton";
import { ApproveButton } from "./ApproveButton";

export default async function KnowledgePage({
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

  const { data: items } = await supabase
    .from("knowledge_items")
    .select("id, category, question, content, approved_at")
    .eq("business_id", businessId)
    .order("category");

  const all = items ?? [];
  const pending = all.filter((i) => !i.approved_at);
  const approved = all.filter((i) => i.approved_at);

  return (
    <main style={{ maxWidth: 700, margin: "3rem auto", fontFamily: "sans-serif" }}>
      <p>
        <Link href={`/admin/prevent/${businessId}`}>← Back to Prevent</Link>
      </p>
      <h1>Approved knowledge — {business.name}</h1>
      <p style={{ color: "#888", fontSize: "0.9rem" }}>
        The response engine only answers from what&apos;s approved here (PRD §17B). Nothing else, ever.
      </p>

      <KnowledgeForm businessId={businessId} />

      {pending.length > 0 && (
        <section style={{ margin: "1.5rem 0", padding: "1rem", border: "1px solid #a60", borderRadius: 4 }}>
          <h2 style={{ marginTop: 0 }}>Needs your review ({pending.length})</h2>
          <p style={{ color: "#888", fontSize: "0.85rem" }}>
            These came from the starter template for your industry. They are <strong>suggestions, not facts</strong> —
            the AI will not use any of them until you confirm each one is correct for your business. Edit is not
            supported yet: delete anything that&apos;s wrong and add your own version above.
          </p>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {pending.map((item) => (
              <li key={item.id} style={{ borderBottom: "1px solid #222", padding: "0.5rem 0" }}>
                <strong>[{item.category}]</strong> {item.question && <em>{item.question} — </em>}
                {item.content}{" "}
                <ApproveButton businessId={businessId} itemId={item.id} />{" "}
                <DeleteButton businessId={businessId} itemId={item.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2>In use by the AI ({approved.length})</h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {approved.map((item) => (
          <li key={item.id} style={{ borderBottom: "1px solid #222", padding: "0.5rem 0" }}>
            <strong>[{item.category}]</strong> {item.question && <em>{item.question} — </em>}
            {item.content} <DeleteButton businessId={businessId} itemId={item.id} />
          </li>
        ))}
        {approved.length === 0 && (
          <li style={{ color: "#888" }}>
            Nothing approved yet — the AI cannot answer any question until at least one item is approved.
          </li>
        )}
      </ul>
    </main>
  );
}

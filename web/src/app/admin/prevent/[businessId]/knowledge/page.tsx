import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { KnowledgeForm } from "./KnowledgeForm";
import { DeleteButton } from "./DeleteButton";

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
    .select("id, category, question, content")
    .eq("business_id", businessId)
    .order("category");

  return (
    <main style={{ maxWidth: 700, margin: "3rem auto", fontFamily: "sans-serif" }}>
      <p>
        <Link href={`/admin/prevent/${businessId}`}>← Back to Prevent</Link>
      </p>
      <h1>Approved knowledge — {business.name}</h1>
      <p style={{ color: "#888", fontSize: "0.9rem" }}>
        The response engine only answers from what&apos;s here (PRD §17B). Nothing else, ever.
      </p>

      <KnowledgeForm businessId={businessId} />

      <ul style={{ listStyle: "none", padding: 0 }}>
        {(items ?? []).map((item) => (
          <li key={item.id} style={{ borderBottom: "1px solid #222", padding: "0.5rem 0" }}>
            <strong>[{item.category}]</strong> {item.question && <em>{item.question} — </em>}
            {item.content} <DeleteButton businessId={businessId} itemId={item.id} />
          </li>
        ))}
        {(items ?? []).length === 0 && <li style={{ color: "#888" }}>No approved knowledge yet.</li>}
      </ul>
    </main>
  );
}

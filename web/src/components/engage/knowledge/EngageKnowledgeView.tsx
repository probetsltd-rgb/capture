import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { KnowledgeForm } from "./KnowledgeForm";
import { BulkAddForm } from "./BulkAddForm";
import { BrochureUploadForm } from "./BrochureUploadForm";
import { DeleteButton } from "./DeleteButton";
import { ApproveButton } from "./ApproveButton";
import { CompletenessToggle } from "./CompletenessToggle";

// Shared body for /admin/engage/[businessId]/knowledge and
// /dashboard/engage/knowledge — see EngageDashboardView.tsx for why.
export async function EngageKnowledgeView({
  businessId,
  backHref,
  backLabel,
}: {
  businessId: string;
  backHref: string;
  backLabel: string;
}) {
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, knowledge_base_confirmed_complete_at")
    .eq("id", businessId)
    .maybeSingle();
  if (!business) {
    return (
      <main className="shell app-page">
        <h1>Not found</h1>
        <p>No business visible with this ID.</p>
      </main>
    );
  }

  const { data: items } = await supabase
    .from("knowledge_items")
    .select("id, category, question, content, approved_at, media_url")
    .eq("business_id", businessId)
    .order("category");

  const all = items ?? [];
  const pending = all.filter((i) => !i.approved_at);
  const approved = all.filter((i) => i.approved_at);

  return (
    <main className="shell app-page">
      <p>
        <Link href={backHref}>{backLabel}</Link>
      </p>
      <h1>Approved knowledge — {business.name}</h1>
      <p className="meta">
        The response engine only answers from what&apos;s approved here (PRD §17B). Nothing else, ever.
      </p>
      <p className="meta">
        Add one entry per product, price, policy, or fact — as many as you need, there&apos;s no fixed set
        to fill in. If you sell several products, add each one separately with its own price and
        variants included, rather than listing prices on their own.
      </p>

      <CompletenessToggle
        businessId={businessId}
        confirmedCompleteAt={business.knowledge_base_confirmed_complete_at as string | null}
      />

      <KnowledgeForm businessId={businessId} />
      <BulkAddForm businessId={businessId} />
      <BrochureUploadForm businessId={businessId} />

      {pending.length > 0 && (
        <section style={{ margin: "1.5rem 0", padding: "1rem", border: "1px solid #a60", borderRadius: 4 }}>
          <h2 style={{ marginTop: 0 }}>Needs your review ({pending.length})</h2>
          <p className="meta">
            These came from an industry starter template or an uploaded document. They are{" "}
            <strong>suggestions, not facts</strong> — the AI will not use any of them until you confirm each one
            is correct for your business. Edit is not supported yet: delete anything that&apos;s wrong and add
            your own version above.
          </p>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {pending.map((item) => (
              <li key={item.id} style={{ borderBottom: "1px solid var(--rule)", padding: "var(--s3) 0" }}>
                <strong>[{item.category}]</strong> {item.question && <em>{item.question} — </em>}
                {item.content}
                {item.media_url && <span className="meta"> 📎 media attached</span>}{" "}
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
          <li key={item.id} style={{ borderBottom: "1px solid var(--rule)", padding: "var(--s3) 0" }}>
            <strong>[{item.category}]</strong> {item.question && <em>{item.question} — </em>}
            {item.content}
            {item.media_url && <span className="meta"> 📎 media attached</span>}{" "}
            <DeleteButton businessId={businessId} itemId={item.id} />
          </li>
        ))}
        {approved.length === 0 && (
          <li className="meta">
            Nothing approved yet — the AI cannot answer any question until at least one item is approved.
          </li>
        )}
      </ul>
    </main>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { KnowledgeForm } from "./KnowledgeForm";
import { BulkAddForm } from "./BulkAddForm";
import { BrochureUploadForm } from "./BrochureUploadForm";
import { WebsiteExtractForm } from "./WebsiteExtractForm";
import { DeleteButton } from "./DeleteButton";
import { ApproveButton } from "./ApproveButton";
import { CompletenessToggle } from "./CompletenessToggle";
import { KnowledgeGapQuestions } from "./KnowledgeGapQuestions";

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

  const { data: gapQuestionRows } = await supabase
    .from("knowledge_gap_questions")
    .select("id, category, question")
    .eq("business_id", businessId)
    .eq("status", "pending")
    .order("created_at");
  const gapQuestions = gapQuestionRows ?? [];

  return (
    <main className="shell app-page">
      <p>
        <Link href={backHref}>{backLabel}</Link>
      </p>
      <h1>Approved knowledge — {business.name}</h1>
      <p className="meta">
        The AI only answers from what&apos;s approved here — nothing else, ever. Add one entry per
        product, price, policy, or fact; list variants and prices together rather than on their own.
      </p>

      {approved.length > 0 && (
        <CompletenessToggle
          businessId={businessId}
          confirmedCompleteAt={business.knowledge_base_confirmed_complete_at as string | null}
        />
      )}

      <KnowledgeForm businessId={businessId} />
      <BulkAddForm businessId={businessId} />
      <BrochureUploadForm businessId={businessId} />
      <WebsiteExtractForm businessId={businessId} />

      <KnowledgeGapQuestions businessId={businessId} questions={gapQuestions} />

      {pending.length > 0 && (
        <div className="panel" style={{ marginTop: "var(--s6)", borderColor: "#e0b070" }}>
          <div className="panel__head">
            <h2 className="h3" style={{ margin: 0 }}>Needs your review ({pending.length})</h2>
          </div>
          <div className="panel__body">
            <p className="meta">
              These came from an industry starter template or an uploaded document. They are{" "}
              <strong>suggestions, not facts</strong> — the AI will not use any of them until you confirm each one
              is correct for your business. Edit is not supported yet: delete anything that&apos;s wrong and add
              your own version above.
            </p>
            <ul style={{ listStyle: "none", padding: 0, marginTop: "var(--s3)" }}>
              {pending.map((item) => (
                <li key={item.id} style={{ borderBottom: "1px solid var(--rule)", padding: "var(--s3) 0" }}>
                  <strong>[{item.category}]</strong> {item.question && <em>{item.question} — </em>}
                  {item.content}
                  {item.media_url && <span className="meta"> 📎 media attached</span>}
                  <span style={{ display: "inline-flex", gap: "var(--s3)", marginLeft: "var(--s3)" }}>
                    <ApproveButton businessId={businessId} itemId={item.id} />
                    <DeleteButton businessId={businessId} itemId={item.id} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="panel" style={{ marginTop: "var(--s6)" }}>
        <div className="panel__head">
          <h2 className="h3" style={{ margin: 0 }}>In use by the AI ({approved.length})</h2>
        </div>
        <div className="panel__body">
          <ul style={{ listStyle: "none", padding: 0 }}>
            {approved.map((item) => (
              <li key={item.id} style={{ borderBottom: "1px solid var(--rule)", padding: "var(--s3) 0" }}>
                <strong>[{item.category}]</strong> {item.question && <em>{item.question} — </em>}
                {item.content}
                {item.media_url && <span className="meta"> 📎 media attached</span>}
                <span style={{ marginLeft: "var(--s3)" }}>
                  <DeleteButton businessId={businessId} itemId={item.id} />
                </span>
              </li>
            ))}
            {approved.length === 0 && (
              <li className="meta">
                Nothing approved yet — the AI cannot answer any question until at least one item is approved.
              </li>
            )}
          </ul>
        </div>
      </div>
    </main>
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uploadKnowledgeMedia } from "@/lib/media/upload";
import { extractTextFromPdf, extractKnowledgeItems } from "@/lib/ingest/brochure-extract";

export type ActionResult = { ok: boolean; message: string };

// "price" was dropped from the offered categories 2026-08-20 (founder
// feedback: businesses with several products/variants had no clear way to
// represent them, and a separate disconnected "price" row per product was
// confusing to fill in and to maintain — updating one product's price meant
// hunting for the right row across two categories). Each product entry now
// carries its own price(s)/variants directly in its content instead. The DB
// CHECK constraint still allows 'price' (no migration — nothing ever wrote
// one, confirmed by checking every seed template and migration), so this is
// purely about what the form offers going forward, not a data change.
const CATEGORIES = ["product", "faq", "hours", "location", "policy", "delivery", "booking", "other"];

// Moved 2026-08-15 from app/admin/prevent/[businessId]/knowledge/actions.ts
// as part of the route restructure (PLANS.md Phase 5.0) — see
// components/engage/actions.ts for why revalidation targets both paths.
function revalidateKnowledgePaths(businessId: string) {
  revalidatePath(`/admin/engage/${businessId}/knowledge`);
  revalidatePath("/dashboard/engage/knowledge");
}

export async function addKnowledgeItem(
  businessId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const category = String(formData.get("category") ?? "");
  const question = String(formData.get("question") ?? "").trim() || null;
  const content = String(formData.get("content") ?? "").trim();
  const mediaFile = formData.get("media");

  if (!CATEGORIES.includes(category)) return { ok: false, message: "Choose a category." };
  if (!content) return { ok: false, message: "Content is required." };

  // Founder request 2026-08-21: attach the actual photo/video, not a link
  // to an external site — this is what lets the response engine send it as
  // a native inline Instagram attachment later (safe-response-gate.ts).
  let mediaUrl: string | null = null;
  if (mediaFile instanceof File && mediaFile.size > 0) {
    const uploadResult = await uploadKnowledgeMedia(businessId, mediaFile);
    if (!uploadResult.ok) return { ok: false, message: uploadResult.message };
    mediaUrl = uploadResult.url;
  }

  const supabase = await createClient();
  // Approved on creation: a human authored this text in this form. Only
  // machine-seeded rows (vertical templates) start unapproved.
  const { error } = await supabase.from("knowledge_items").insert({
    business_id: businessId,
    category,
    question,
    content,
    media_url: mediaUrl,
    approved_at: new Date().toISOString(),
  });
  if (error) return { ok: false, message: "Could not save — check you have access to this business." };

  revalidateKnowledgePaths(businessId);
  return { ok: true, message: "Added." };
}

// Vertical-template items land unapproved and are invisible to the response
// engine until a human confirms the content is actually true for this
// business — see supabase/migrations/20260811000003_phase4_hardening.sql.
export async function approveKnowledgeItem(businessId: string, itemId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_items")
    .update({ approved_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("business_id", businessId)
    .select("id");

  if (error) return { ok: false, message: "Could not approve." };
  // An RLS-filtered UPDATE returns no error and zero rows — treat that as
  // the failure it is rather than reporting success.
  if (!data || data.length === 0) {
    return { ok: false, message: "Could not approve — check you have access to this business." };
  }

  revalidateKnowledgePaths(businessId);
  return { ok: true, message: "Approved — the AI can now use this." };
}

// A business with a real catalog (dozens of products/variants) shouldn't
// have to click "Add" once per item — structurally that's no different to
// the response engine than 30 separate rows (buildKnowledgeContext just
// concatenates every approved item into context either way), so a bulk
// paste is a real UX fix, not a shortcut that weakens grounding. Bounded
// the same way updateRules() bounds escalation keywords, for the same
// reason: user-authored input that fans out into N rows needs a sane cap.
const MAX_BULK_ITEMS = 100;
// One line = one item, by design — a cap this low is deliberate, to catch
// someone pasting a paragraph as "line 1" rather than one fact per line.
const MAX_ITEM_LENGTH = 300;

export async function addKnowledgeItemsBulk(
  businessId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const category = String(formData.get("category") ?? "");
  const rawText = String(formData.get("items") ?? "");

  if (!CATEGORIES.includes(category)) return { ok: false, message: "Choose a category." };

  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return { ok: false, message: "Paste at least one item, one per line." };
  if (lines.length > MAX_BULK_ITEMS) {
    return { ok: false, message: `Please add at most ${MAX_BULK_ITEMS} items at once — split larger catalogs into batches.` };
  }
  const tooLong = lines.find((l) => l.length > MAX_ITEM_LENGTH);
  if (tooLong) {
    return {
      ok: false,
      message: `One line is over ${MAX_ITEM_LENGTH} characters — keep each item to one product/fact, not a paragraph: "${tooLong.slice(0, 60)}..."`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("knowledge_items").insert(
    lines.map((content) => ({
      business_id: businessId,
      category,
      question: null,
      content,
      approved_at: new Date().toISOString(),
    })),
  );
  if (error) return { ok: false, message: "Could not save — check you have access to this business." };

  revalidateKnowledgePaths(businessId);
  return { ok: true, message: `Added ${lines.length} item${lines.length === 1 ? "" : "s"}.` };
}

export async function deleteKnowledgeItem(businessId: string, itemId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("knowledge_items").delete().eq("id", itemId);
  if (error) return { ok: false, message: "Could not delete." };
  revalidateKnowledgePaths(businessId);
  return { ok: true, message: "Deleted." };
}

// Founder-caught 2026-08-21: a gap in the approved knowledge isn't evidence
// a business doesn't offer something, so the engine defaults to escalating
// unlisted-but-plausible requests rather than confidently denying them
// (engine.ts's buildCompletenessBlock). This lets a business explicitly
// flip that default once their catalog genuinely is exhaustive. Same
// defensive-write discipline as dashboard/actions.ts: an RLS-filtered
// UPDATE returns no error and zero rows, so success is checked via
// `.select()` returning a row, not just the absence of `error`.
export async function setKnowledgeBaseComplete(businessId: string, complete: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .update({ knowledge_base_confirmed_complete_at: complete ? new Date().toISOString() : null })
    .eq("id", businessId)
    .select("id");

  if (error) return { ok: false, message: "Could not save. Please try again." };
  if (!data || data.length === 0) {
    return { ok: false, message: "Could not save — check you have access to this business." };
  }

  revalidateKnowledgePaths(businessId);
  return {
    ok: true,
    message: complete
      ? "Marked complete — the AI can now confidently say something isn't offered instead of always checking with your team."
      : "Unmarked — the AI will escalate anything not listed here instead of assuming it isn't offered.",
  };
}

const MAX_BROCHURE_BYTES = 15 * 1024 * 1024; // matches Vercel's request-body ceiling with headroom

// Founder request 2026-08-21: a brochure or price list a business already
// has shouldn't mean re-typing everything by hand. Extracted items land
// UNAPPROVED — same "Needs your review" queue vertical-template
// suggestions already use (EngageKnowledgeView.tsx) — nothing from an
// uploaded document reaches the AI until a human confirms each one is
// actually correct, same safety guarantee as every other knowledge item.
export async function uploadBrochure(businessId: string, formData: FormData): Promise<ActionResult> {
  const file = formData.get("brochure");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a PDF or text file to upload." };
  }
  if (file.size > MAX_BROCHURE_BYTES) {
    return { ok: false, message: "File is too large — please split it into smaller batches." };
  }

  let text: string;
  if (file.type === "application/pdf") {
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      text = await extractTextFromPdf(buffer);
    } catch {
      return { ok: false, message: "Could not read this PDF — it may be scanned images without a text layer." };
    }
  } else if (file.type === "text/plain") {
    text = await file.text();
  } else {
    return { ok: false, message: "Please upload a PDF or plain text (.txt) file." };
  }

  const items = await extractKnowledgeItems(text);
  if (items === null) {
    return { ok: false, message: "Could not extract knowledge items from this document — please try again." };
  }
  if (items.length === 0) {
    return { ok: false, message: "No extractable content found in this document." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("knowledge_items").insert(
    items.map((item) => ({
      business_id: businessId,
      category: item.category,
      question: null,
      content: item.content,
      media_url: null,
      approved_at: null, // pending review — same gate as vertical-template suggestions
    })),
  );
  if (error) return { ok: false, message: "Could not save — check you have access to this business." };

  revalidateKnowledgePaths(businessId);
  return {
    ok: true,
    message: `Extracted ${items.length} item${items.length === 1 ? "" : "s"} — review them below before they're used.`,
  };
}

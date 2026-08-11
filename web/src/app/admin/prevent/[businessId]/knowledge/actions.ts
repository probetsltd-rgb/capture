"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

const CATEGORIES = ["product", "price", "faq", "hours", "location", "policy", "delivery", "booking", "other"];

export async function addKnowledgeItem(
  businessId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const category = String(formData.get("category") ?? "");
  const question = String(formData.get("question") ?? "").trim() || null;
  const content = String(formData.get("content") ?? "").trim();

  if (!CATEGORIES.includes(category)) return { ok: false, message: "Choose a category." };
  if (!content) return { ok: false, message: "Content is required." };

  const supabase = await createClient();
  // Approved on creation: a human authored this text in this form. Only
  // machine-seeded rows (vertical templates) start unapproved.
  const { error } = await supabase.from("knowledge_items").insert({
    business_id: businessId,
    category,
    question,
    content,
    approved_at: new Date().toISOString(),
  });
  if (error) return { ok: false, message: "Could not save — check you have access to this business." };

  revalidatePath(`/admin/prevent/${businessId}/knowledge`);
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

  revalidatePath(`/admin/prevent/${businessId}/knowledge`);
  return { ok: true, message: "Approved — the AI can now use this." };
}

export async function deleteKnowledgeItem(businessId: string, itemId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("knowledge_items").delete().eq("id", itemId);
  if (error) return { ok: false, message: "Could not delete." };
  revalidatePath(`/admin/prevent/${businessId}/knowledge`);
  return { ok: true, message: "Deleted." };
}

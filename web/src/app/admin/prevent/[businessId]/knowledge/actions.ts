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
  const { error } = await supabase.from("knowledge_items").insert({ business_id: businessId, category, question, content });
  if (error) return { ok: false, message: "Could not save — check you have access to this business." };

  revalidatePath(`/admin/prevent/${businessId}/knowledge`);
  return { ok: true, message: "Added." };
}

export async function deleteKnowledgeItem(businessId: string, itemId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("knowledge_items").delete().eq("id", itemId);
  if (error) return { ok: false, message: "Could not delete." };
  revalidatePath(`/admin/prevent/${businessId}/knowledge`);
  return { ok: true, message: "Deleted." };
}

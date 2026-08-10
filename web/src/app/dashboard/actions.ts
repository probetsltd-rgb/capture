"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// All actions here run through the AUTHENTICATED client — RLS
// (business_members/platform_admins) governs access, same discipline as
// admin/recover and admin/prevent's actions. No admin-only assumption.

export type ActionResult = { ok: boolean; message: string };

export async function activateProduct(businessId: string, product: "recover" | "prevent"): Promise<ActionResult> {
  const supabase = await createClient();

  if (product === "prevent") {
    const { count } = await supabase
      .from("knowledge_items")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId);
    if (!count) {
      return { ok: false, message: "Add at least one approved knowledge item before activating Prevent." };
    }
  }

  const column = product === "recover" ? "recover_activated_at" : "prevent_activated_at";
  const { error } = await supabase
    .from("businesses")
    .update({ [column]: new Date().toISOString() })
    .eq("id", businessId);
  if (error) return { ok: false, message: "Could not activate — check you have access to this business." };

  revalidatePath("/dashboard");
  return { ok: true, message: `${product === "recover" ? "Recover" : "Prevent"} activated.` };
}

// Phase 4 "Configure Rules" — self-serve override of the hardcoded
// defaults in recover/rules.ts (MAX_AUTOMATIONS_PER_OPPORTUNITY) and
// prevent/deterministic-triggers.ts's fixed patterns.
export async function updateRules(
  businessId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();

  const maxAiRaw = String(formData.get("max_ai_followups") ?? "").trim();
  const maxRecoverRaw = String(formData.get("max_recover_followups") ?? "").trim();
  const keywordsRaw = String(formData.get("escalation_keywords") ?? "").trim();

  const maxAi = maxAiRaw ? Number(maxAiRaw) : null;
  const maxRecover = maxRecoverRaw ? Number(maxRecoverRaw) : null;
  if (maxAiRaw && (!Number.isInteger(maxAi) || maxAi! < 0)) {
    return { ok: false, message: "Max AI follow-ups must be a non-negative whole number." };
  }
  if (maxRecoverRaw && (!Number.isInteger(maxRecover) || maxRecover! < 0)) {
    return { ok: false, message: "Max recover follow-ups must be a non-negative whole number." };
  }

  const escalationKeywords = keywordsRaw
    ? keywordsRaw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    : [];

  const { error } = await supabase
    .from("businesses")
    .update({
      max_ai_followups: maxAi,
      max_recover_followups: maxRecover,
      escalation_keywords: escalationKeywords,
    })
    .eq("id", businessId);

  if (error) return { ok: false, message: "Could not save — check you have access to this business." };

  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Rules updated." };
}

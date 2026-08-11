"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MAX_AUTOMATIONS_PER_OPPORTUNITY } from "@/lib/recover/rules";

// All actions here run through the AUTHENTICATED client — RLS
// (business_members/platform_admins) governs access, same discipline as
// admin/recover and admin/prevent's actions. No admin-only assumption.
//
// Note on error handling throughout this file: a PostgREST UPDATE whose
// rows are filtered out by an RLS USING predicate returns **no error** and
// a 204 — verified empirically against the live project, not assumed. So
// every write here uses `.select()` and treats an empty result as failure;
// checking `error` alone would report success on a denied write.

export type ActionResult = { ok: boolean; message: string };

export async function activateProduct(businessId: string, product: "recover" | "prevent"): Promise<ActionResult> {
  const supabase = await createClient();

  if (product === "prevent") {
    // Only *approved* knowledge counts. Vertical-template onboarding seeds
    // unapproved suggestions, and activating on the strength of those would
    // put boilerplate no business ever confirmed in front of real customers.
    const { count } = await supabase
      .from("knowledge_items")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .not("approved_at", "is", null);
    if (!count) {
      return {
        ok: false,
        message:
          "Approve at least one knowledge item before activating Prevent — starter-template suggestions don't count until you confirm them.",
      };
    }
  }

  const column = product === "recover" ? "recover_activated_at" : "prevent_activated_at";
  const { data, error } = await supabase
    .from("businesses")
    .update({ [column]: new Date().toISOString() })
    .eq("id", businessId)
    .select("id");

  if (error) return { ok: false, message: "Could not activate. Please try again." };
  if (!data || data.length === 0) {
    return { ok: false, message: "Could not activate — check you have access to this business." };
  }

  revalidatePath("/dashboard");
  return { ok: true, message: `${product === "recover" ? "Recover" : "Prevent"} activated.` };
}

// Business-supplied escalation keywords are substring-matched against every
// inbound message (prevent/deterministic-triggers.ts), so a 1-2 character
// entry like "a" would escalate literally everything and silently disable
// Prevent. Bounded here rather than trusted.
const MIN_KEYWORD_LENGTH = 3;
const MAX_KEYWORDS = 25;
const MAX_KEYWORD_LENGTH = 50;

// Phase 4 "Configure Rules" — self-serve override of the platform default
// in recover/rules.ts. The cap can only be tightened, never loosened; see
// effectiveMaxContacts() for the authoritative clamp at the enforcement
// point (this is the input-validation layer, not the guarantee).
export async function updateRules(
  businessId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();

  const maxRecoverRaw = String(formData.get("max_recover_followups") ?? "").trim();
  const keywordsRaw = String(formData.get("escalation_keywords") ?? "").trim();

  let maxRecover: number | null = null;
  if (maxRecoverRaw) {
    maxRecover = Number(maxRecoverRaw);
    if (!Number.isInteger(maxRecover) || maxRecover < 0) {
      return { ok: false, message: "Max Recover follow-ups must be a whole number of 0 or more." };
    }
    if (maxRecover > MAX_AUTOMATIONS_PER_OPPORTUNITY) {
      return {
        ok: false,
        message: `Max Recover follow-ups cannot exceed ${MAX_AUTOMATIONS_PER_OPPORTUNITY} — this is an anti-spam guarantee to your customers (PRD §12), not a preference.`,
      };
    }
  }

  const keywords = Array.from(
    new Set(
      keywordsRaw
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  if (keywords.length > MAX_KEYWORDS) {
    return { ok: false, message: `Please use at most ${MAX_KEYWORDS} escalation keywords.` };
  }
  const tooShort = keywords.find((k) => k.length < MIN_KEYWORD_LENGTH);
  if (tooShort) {
    return {
      ok: false,
      message: `"${tooShort}" is too short — keywords must be at least ${MIN_KEYWORD_LENGTH} characters, or they'd match almost every message.`,
    };
  }
  const tooLong = keywords.find((k) => k.length > MAX_KEYWORD_LENGTH);
  if (tooLong) {
    return { ok: false, message: `Keywords must be under ${MAX_KEYWORD_LENGTH} characters.` };
  }

  const { data, error } = await supabase
    .from("businesses")
    .update({ max_recover_followups: maxRecover, escalation_keywords: keywords })
    .eq("id", businessId)
    .select("id");

  if (error) return { ok: false, message: "Could not save. Please try again." };
  if (!data || data.length === 0) {
    return { ok: false, message: "Could not save — check you have access to this business." };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Rules updated." };
}

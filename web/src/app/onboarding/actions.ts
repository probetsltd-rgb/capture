"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { INDUSTRIES } from "@/app/find/constants";

export type ActionResult = { ok: boolean; message: string };

async function getVerifiedUser(): Promise<{ id: string; email: string } | null> {
  // Never trust client-supplied identity for the business_members grant
  // below — always derive it from the server-verified session.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub as string | undefined;
  const email = data?.claims?.email as string | undefined;
  if (!sub || !email) return null;
  return { id: sub, email };
}

type TemplateItem = { category: string; question: string | null; content: string };

// Applies a vertical_templates row (if one exists for this industry) to a
// business that the caller already has real membership in — so this runs
// AFTER the business_members insert, via the authenticated client, not
// service-role. Same authorization boundary as every other tenant write in
// this app (RLS via is_business_member), not a special onboarding-only path.
async function applyVerticalTemplate(businessId: string, industry: string): Promise<void> {
  const supabase = await createClient();
  const { data: template } = await supabase
    .from("vertical_templates")
    .select(
      "knowledge_base_items, default_escalation_keywords, default_max_ai_followups, default_max_recover_followups",
    )
    .eq("vertical", industry)
    .maybeSingle();

  if (!template) return; // no starter template for this industry yet — not an error, just nothing to apply

  const items = (template.knowledge_base_items as TemplateItem[] | null) ?? [];
  if (items.length > 0) {
    await supabase.from("knowledge_items").insert(
      items.map((item) => ({
        business_id: businessId,
        category: item.category,
        question: item.question,
        content: item.content,
      })),
    );
  }

  await supabase
    .from("businesses")
    .update({
      escalation_keywords: template.default_escalation_keywords,
      max_ai_followups: template.default_max_ai_followups,
      max_recover_followups: template.default_max_recover_followups,
    })
    .eq("id", businessId);
}

// Path A: fresh self-serve signup, no prior Find audit.
export async function createBusinessAndOnboard(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getVerifiedUser();
  if (!user) return { ok: false, message: "Your session expired — please sign in again." };

  const businessName = String(formData.get("business_name") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();
  const avgTransactionValueRaw = String(formData.get("avg_transaction_value") ?? "").trim();

  if (!businessName || businessName.length > 200) {
    return { ok: false, message: "Business name is required." };
  }
  if (!INDUSTRIES.some((i) => i.value === industry)) {
    return { ok: false, message: "Please choose an industry." };
  }
  let avgTransactionValue: number | null = null;
  if (avgTransactionValueRaw) {
    avgTransactionValue = Number(avgTransactionValueRaw);
    if (!Number.isFinite(avgTransactionValue) || avgTransactionValue < 0) {
      return { ok: false, message: "Average transaction value must be a positive number." };
    }
  }

  // The one genuinely privileged write in this whole flow: business_members
  // has no client INSERT policy by design (self-granting tenant membership
  // must never be something an RLS predicate can be satisfied into), so
  // creating the row requires the service role, guarded here by the
  // server-verified session above rather than by anything the client sent.
  const service = createServiceRoleClient();
  const { data: business, error } = await service
    .from("businesses")
    .insert({
      name: businessName,
      industry,
      contact_email: user.email,
      avg_transaction_value: avgTransactionValue,
      signup_source: "self_serve_signup",
      onboarded_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !business) {
    return { ok: false, message: "Could not create your business. Please try again." };
  }

  const { error: memberError } = await service
    .from("business_members")
    .insert({ business_id: business.id, user_id: user.id, role: "owner" });
  if (memberError) {
    return { ok: false, message: "Could not link your account. Please try again." };
  }

  await applyVerticalTemplate(business.id, industry);

  return { ok: true, message: "Account created." };
}

// Path B: claim a business created anonymously via Find intake
// (web/src/app/find/actions.ts). Token possession (same upload_token used
// for /upload and /report — PLANS.md 1.4a's established pattern) PLUS a
// match against the contact_email the business already gave at intake — the
// signed-in email alone is never enough, since /login lets any email
// authenticate. Single-claim: refuses if the business already has a member.
export async function claimBusiness(token: string): Promise<ActionResult> {
  const user = await getVerifiedUser();
  if (!user) return { ok: false, message: "Your session expired — please sign in again." };

  const service = createServiceRoleClient();
  const { data: business } = await service
    .from("businesses")
    .select("id, industry, contact_email")
    .eq("upload_token", token)
    .maybeSingle();

  if (!business) return { ok: false, message: "This claim link is invalid." };
  if (!business.contact_email || business.contact_email.toLowerCase() !== user.email.toLowerCase()) {
    return {
      ok: false,
      message: "This audit was registered under a different email address. Sign in with that email to claim it.",
    };
  }

  const { data: existingMember } = await service
    .from("business_members")
    .select("id")
    .eq("business_id", business.id)
    .limit(1)
    .maybeSingle();
  if (existingMember) {
    return { ok: false, message: "This business has already been claimed by another account." };
  }

  const { error: memberError } = await service
    .from("business_members")
    .insert({ business_id: business.id, user_id: user.id, role: "owner" });
  if (memberError) return { ok: false, message: "Could not link your account. Please try again." };

  await service.from("businesses").update({ onboarded_at: new Date().toISOString() }).eq("id", business.id);

  if (business.industry) {
    await applyVerticalTemplate(business.id, business.industry);
  }

  return { ok: true, message: "Account linked." };
}

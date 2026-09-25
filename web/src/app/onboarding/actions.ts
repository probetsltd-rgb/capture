"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateUploadToken } from "@/lib/upload-token";
import { INDUSTRIES, CONSENT_VERSION } from "@/app/find/constants";
import { notifyPendingKnowledgeItems } from "@/lib/notifications/knowledge-review-whatsapp";

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

function clientIp(headerList: Headers): string {
  const forwarded = headerList.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

// Filtered by user_id explicitly rather than relying on RLS's default
// scoping — platform_admins can see every business_members row via
// is_business_member(), so an unfiltered check would read as "already has a
// business" for the founder's own account.
async function existingMembershipCount(userId: string): Promise<number> {
  const service = createServiceRoleClient();
  const { count } = await service
    .from("business_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

type TemplateItem = { category: string; question: string | null; content: string };

/**
 * Applies a vertical_templates row (if one exists for this industry) to a
 * business the caller already has real membership in — so it runs AFTER the
 * membership grant, via the authenticated client, under the same RLS
 * boundary as every other tenant write.
 *
 * Knowledge items land **unapproved** (`approved_at: null`): this content is
 * generic boilerplate from a migration, not something the business
 * confirmed, and the Prevent engine must never state it to a customer as
 * fact. The business approves each item at
 * /admin/prevent/[businessId]/knowledge.
 *
 * Returns false on any write failure so the caller can tell the user their
 * workspace is only half set up, rather than silently landing them on a
 * dashboard with an empty knowledge base and no explanation.
 */
async function applyVerticalTemplate(businessId: string, industry: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: template, error: templateError } = await supabase
    .from("vertical_templates")
    .select("knowledge_base_items, default_escalation_keywords, default_max_recover_followups")
    .eq("vertical", industry)
    .maybeSingle();

  if (templateError) return false;
  if (!template) return true; // no starter template for this industry — nothing to apply, not a failure

  const items = (template.knowledge_base_items as TemplateItem[] | null) ?? [];
  if (items.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("knowledge_items")
      .insert(
        items.map((item) => ({
          business_id: businessId,
          category: item.category,
          question: item.question,
          content: item.content,
          approved_at: null,
          source: "vertical_template",
        })),
      )
      .select("id, category, content");
    if (insertError) return false;
    // No-ops if nobody has a WhatsApp number set yet (the common case this
    // early in onboarding) — same graceful-no-recipient behavior as every
    // other call site.
    void notifyPendingKnowledgeItems(businessId, inserted ?? []);
  }

  const { data: updated, error: updateError } = await supabase
    .from("businesses")
    .update({
      escalation_keywords: template.default_escalation_keywords,
      max_recover_followups: template.default_max_recover_followups,
    })
    .eq("id", businessId)
    .select("id");

  // An RLS-filtered UPDATE returns no error and zero rows.
  if (updateError || !updated || updated.length === 0) return false;
  return true;
}

const PARTIAL_SETUP_MESSAGE =
  "Your account is set up, but we couldn't finish applying your industry starter template. You can add your own knowledge items from the dashboard.";

// Path A: fresh self-serve signup, no prior Find audit.
export async function createBusinessAndOnboard(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getVerifiedUser();
  if (!user) return { ok: false, message: "Your session expired — please sign in again." };

  // The page-level redirect for existing members is a UX convenience, not a
  // guard — a direct POST, or a double-click racing the redirect, bypasses
  // it and would mint a second tenant for the same person.
  if ((await existingMembershipCount(user.id)) > 0) {
    return { ok: false, message: "You already have a business set up." };
  }

  const businessName = String(formData.get("business_name") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();
  const avgTransactionValueRaw = String(formData.get("avg_transaction_value") ?? "").trim();
  const consent = formData.get("consent") === "on";

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
  // Same standard as the public Find intake: an auditable, versioned consent
  // record, not just a UI checkbox (Cross-Cutting Security Workstream).
  if (!consent) {
    return { ok: false, message: "Please confirm you agree before continuing." };
  }

  const headerList = await headers();
  const ip = clientIp(headerList);

  // Authenticated, but signup is open to any email that can receive a magic
  // link, so this path still needs a limit — keyed by user rather than IP
  // since the session is the thing we can actually attribute.
  const { allowed } = await checkRateLimit(`onboarding:${user.id}`, { max: 5, windowMinutes: 60 });
  if (!allowed) {
    return { ok: false, message: "Too many attempts. Please try again later." };
  }

  // Single transactional statement: the businesses insert and the
  // business_members grant cannot half-apply and strand an orphan tenant
  // that no one can reach and nothing cleans up. business_members has no
  // INSERT policy by design, so this necessarily runs as service_role —
  // guarded by the server-verified session above, never by client input.
  const service = createServiceRoleClient();
  const { data: businessId, error } = await service.rpc("create_business_with_owner", {
    p_user_id: user.id,
    p_name: businessName,
    p_industry: industry,
    p_contact_email: user.email,
    p_avg_transaction_value: avgTransactionValue,
    p_upload_token: generateUploadToken(),
    p_consent_version: CONSENT_VERSION,
    p_intake_ip: ip === "unknown" ? null : ip,
  });

  if (error || !businessId) {
    return { ok: false, message: "Could not create your business. Please try again." };
  }

  const templateApplied = await applyVerticalTemplate(businessId as string, industry);
  return templateApplied
    ? { ok: true, message: "Account created." }
    : { ok: true, message: PARTIAL_SETUP_MESSAGE };
}

// Path B: claim a business created anonymously via Find intake
// (web/src/app/find/actions.ts). Token possession (the same upload_token
// used for /upload and /report) PLUS a match against the contact_email the
// business already gave at intake — the signed-in email alone is never
// enough, since /login lets any email authenticate.
export async function claimBusiness(token: string): Promise<ActionResult> {
  const user = await getVerifiedUser();
  if (!user) return { ok: false, message: "Your session expired — please sign in again." };

  if ((await existingMembershipCount(user.id)) > 0) {
    return { ok: false, message: "You already have a business set up." };
  }

  const { allowed } = await checkRateLimit(`claim:${user.id}`, { max: 10, windowMinutes: 60 });
  if (!allowed) {
    return { ok: false, message: "Too many attempts. Please try again later." };
  }

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

  // Single-claim is enforced by a unique index on
  // business_members(business_id) WHERE role='owner', not by a read-then-write
  // check — two concurrent claims on the same audit would both pass a read.
  // The insert below is the actual arbiter; 23505 means someone won the race.
  const { error: memberError } = await service
    .from("business_members")
    .insert({ business_id: business.id, user_id: user.id, role: "owner" });

  if (memberError) {
    if (memberError.code === "23505") {
      return { ok: false, message: "This business has already been claimed by another account." };
    }
    return { ok: false, message: "Could not link your account. Please try again." };
  }

  await service.from("businesses").update({ onboarded_at: new Date().toISOString() }).eq("id", business.id);

  const templateApplied = business.industry ? await applyVerticalTemplate(business.id, business.industry) : true;
  return templateApplied ? { ok: true, message: "Account linked." } : { ok: true, message: PARTIAL_SETUP_MESSAGE };
}

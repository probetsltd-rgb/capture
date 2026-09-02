"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnBusinessId } from "@/lib/business-membership";
import { MAX_AUTOMATIONS_PER_OPPORTUNITY } from "@/lib/recover/rules";
import { disconnectInstagram, deleteInstagramData, resetInstagramConversationHistory } from "@/lib/channels/instagram";
import { initializeTransaction } from "@/lib/payments/paystack";
import { getSiteUrl } from "@/lib/site-url";

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

// This used to take a `product: "recover" | "prevent"` param — "recover"
// was a free "Activate Recover" pilot flag, retired 2026-08-25 when real,
// paid Recover access replaced it (see dashboard/recover/page.tsx and
// recover_purchases). Only "prevent" (Engage) is left, so the param is
// gone rather than kept as a single-value formality. "prevent" internally
// still refers to Engage (matches businesses.prevent_activated_at) — not
// renamed, per AD-9's decision to avoid DB/internal churn with zero
// customer-visible benefit; only the display label changed.
export async function activateProduct(businessId: string): Promise<ActionResult> {
  const supabase = await createClient();

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

  const now = new Date();

  // Founder request 2026-08-21: Engage's trial clock starts here, not at
  // signup — a business may sign up long before it's ready to actually
  // turn Engage on. trial_days lives in app_settings (admin-editable, not
  // hardcoded) so the trial length can be tuned without a redeploy.
  const { data: setting } = await supabase.from("app_settings").select("value").eq("key", "trial_days").maybeSingle();
  const trialDays = Number(setting?.value ?? 7);
  const trialEnds = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
  const update = {
    prevent_activated_at: now.toISOString(),
    trial_started_at: now.toISOString(),
    trial_ends_at: trialEnds.toISOString(),
    plan_status: "trialing",
  };

  const { data, error } = await supabase.from("businesses").update(update).eq("id", businessId).select("id");

  if (error) return { ok: false, message: "Could not activate. Please try again." };
  if (!data || data.length === 0) {
    return { ok: false, message: "Could not activate — check you have access to this business." };
  }

  revalidatePath("/dashboard");
  return { ok: true, message: "Engage activated." };
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

// channel_connections has zero RLS policies for `authenticated` (see its
// migration) — ownership has to be verified explicitly here, unlike every
// other action in this file, before calling the service-role-backed
// disconnectInstagram(). A founder-caught gap (2026-08-15): the dashboard
// had a "Connect Instagram" link but nothing to reconnect or disconnect
// once already connected.
export async function disconnectInstagramAction(businessId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ok: false, message: "Not signed in." };

  const userId = claims.claims.sub as string;
  const ownBusinessId = await getOwnBusinessId(supabase, userId);
  if (!ownBusinessId || ownBusinessId !== businessId) {
    return { ok: false, message: "Could not disconnect — check you have access to this business." };
  }

  await disconnectInstagram(businessId);
  revalidatePath("/dashboard");
  return { ok: true, message: "Instagram disconnected." };
}

// Meta Data Deletion Instructions requirement (META_APP_REVIEW.md §5) —
// deliberately separate from disconnectInstagramAction above: disconnect is
// reversible (reconnect picks up where you left off), this is not. Same
// ownership-check discipline (channel_connections/customers have no
// authenticated-role RLS policies, so this must be verified explicitly
// before calling the service-role-backed deleteInstagramData()).
export async function deleteInstagramDataAction(businessId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ok: false, message: "Not signed in." };

  const userId = claims.claims.sub as string;
  const ownBusinessId = await getOwnBusinessId(supabase, userId);
  if (!ownBusinessId || ownBusinessId !== businessId) {
    return { ok: false, message: "Could not delete — check you have access to this business." };
  }

  const result = await deleteInstagramData(businessId, userId);
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `Deleted. Removed ${result.customersDeleted} customer${result.customersDeleted === 1 ? "" : "s"} and all associated Instagram conversations, messages, and the stored connection.`,
  };
}

// Narrower than deleteInstagramDataAction above — clears conversation
// history for a fresh demo/screencast without disconnecting Instagram, so
// the connection doesn't need to be redone afterward. See
// resetInstagramConversationHistory()'s own comment for why this is kept
// distinct from the Meta-compliance deletion action rather than a flag on it.
export async function resetInstagramConversationHistoryAction(businessId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ok: false, message: "Not signed in." };

  const userId = claims.claims.sub as string;
  const ownBusinessId = await getOwnBusinessId(supabase, userId);
  if (!ownBusinessId || ownBusinessId !== businessId) {
    return { ok: false, message: "Could not reset — check you have access to this business." };
  }

  const result = await resetInstagramConversationHistory(businessId, userId);
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `Reset. Removed ${result.customersDeleted} customer${result.customersDeleted === 1 ? "" : "s"} and all associated conversations/messages. Instagram connection untouched.`,
  };
}

// Groundwork for WhatsApp-relay escalations (not live yet — WhatsApp
// sending/receiving is still blocked on DEP-1, see OUTSTANDINGS.md) — a
// team member's own notification number, self-serve since it's personal
// contact info, not a business-wide setting. Uses the plain authenticated
// client: business_members_update_self (20260902000000 migration) scopes
// the RLS policy to `user_id = auth.uid()`, so the database itself
// enforces that a member can only ever edit their own row — no explicit
// ownership check needed here, unlike the channel_connections-backed
// actions above which have zero RLS and must check in code.
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export async function updateOwnWhatsAppNumber(
  businessId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ok: false, message: "Not signed in." };
  const userId = claims.claims.sub as string;

  const trimmed = String(formData.get("rawNumber") ?? "").trim();
  const whatsappNumber = trimmed === "" ? null : trimmed;
  if (whatsappNumber && !E164_PATTERN.test(whatsappNumber)) {
    return {
      ok: false,
      message: "Enter your number in international format, e.g. +2348012345678 (no spaces or dashes).",
    };
  }

  const { data, error } = await supabase
    .from("business_members")
    .update({ whatsapp_number: whatsappNumber })
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .select("id");

  if (error) return { ok: false, message: "Could not save. Please try again." };
  if (!data || data.length === 0) {
    return { ok: false, message: "Could not save — check you have access to this business." };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, message: whatsappNumber ? "Notification number saved." : "Notification number removed." };
}

// Founder request 2026-08-21: pay-to-continue billing for Engage. Starts a
// real Paystack checkout for the chosen plan and redirects there — this
// throws Next's internal redirect signal on success, so a normal return
// only ever happens on failure. Real activation is never granted here or
// on the callback below; only the webhook (api/webhooks/paystack/route.ts)
// flips businesses.plan_status, since that's the only party that has
// actually confirmed payment succeeded.
export async function startSubscription(businessId: string, planId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("contact_email")
    .eq("id", businessId)
    .maybeSingle();
  if (!business) return { ok: false, message: "Could not start checkout — check you have access to this business." };

  const { data: claims } = await supabase.auth.getClaims();
  const userEmail = claims?.claims?.email as string | undefined;
  const email = business.contact_email || userEmail;
  if (!email) {
    return { ok: false, message: "No email on file to send the receipt to — add a contact email in Settings first." };
  }

  const { data: plan } = await supabase
    .from("plans")
    .select("price_kobo, paystack_plan_code")
    .eq("id", planId)
    .maybeSingle();
  if (!plan?.paystack_plan_code) {
    return { ok: false, message: "This plan isn't fully set up yet — please contact us to subscribe." };
  }

  let authorizationUrl: string;
  try {
    const result = await initializeTransaction({
      email,
      amountKobo: plan.price_kobo,
      planCode: plan.paystack_plan_code,
      callbackUrl: `${getSiteUrl()}/dashboard/billing/callback`,
      metadata: { business_id: businessId },
    });
    authorizationUrl = result.authorizationUrl;
  } catch (error) {
    console.error("Paystack initialize-transaction failed", error);
    return { ok: false, message: "Could not start checkout — please try again." };
  }

  redirect(authorizationUrl);
}

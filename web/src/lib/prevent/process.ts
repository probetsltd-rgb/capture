import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processInboundMessage } from "./engine";
import { evaluateSafeResponseGate } from "./safe-response-gate";
import { sendEscalationNotification } from "@/lib/notifications/escalation-email";
import { getSiteUrl } from "@/lib/site-url";

// The kill switch (PRD §23: "when a human takes over, AI stops") is
// enforced here, not just hidden behind a UI button — a conversation is
// re-checked for human takeover both BEFORE starting AI processing and
// AGAIN immediately before the AI's response is committed, discarding the
// response if a human took over while the model was "thinking" (a real
// generateObject call takes ~1-2s, a realistic window for this race).
// Tested directly against that race in TESTS.md, not just reasoned about.

async function getConversationStatus(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<{ state: string | null; humanTakenAt: string | null }> {
  const { data } = await supabase
    .from("conversations")
    .select("state, human_taken_at")
    .eq("id", conversationId)
    .single();
  return { state: data?.state ?? null, humanTakenAt: data?.human_taken_at ?? null };
}

function isHumanActive(status: { state: string | null; humanTakenAt: string | null }): boolean {
  return status.state === "human_handling" || status.humanTakenAt !== null;
}

// Founder request 2026-08-21: real Engage billing (Paystack), pay-to-
// continue at trial end. A business activated *before* this migration has
// `trial_started_at === null` — grandfathered in, never gated here, since
// nobody asked for an existing real customer to be retroactively paywalled
// (the founder can backfill trial dates manually if that's ever wanted).
// This never touches whether a conversation escalates for safety reasons —
// it only decides whether the AI is allowed to run at all.
export type BillingStatus = {
  planStatus: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
};

// Exported so the dashboard paywall (app/dashboard/page.tsx) can render the
// exact same gate decision the real enforcement point uses, instead of a
// second hand-rolled copy of this logic that could quietly drift from it.
export function checkBillingGate(business: BillingStatus, now: Date = new Date()): string | null {
  if (!business.trialStartedAt) return null;

  if (business.planStatus === "active") {
    // Paystack's own recurring charge is the primary renewal mechanism;
    // this is only a safety net for a webhook that never arrived.
    if (business.currentPeriodEnd && new Date(business.currentPeriodEnd) < now) {
      return "Your subscription period has ended and hasn't renewed yet.";
    }
    return null;
  }

  if (business.trialEndsAt && new Date(business.trialEndsAt) < now) {
    return "Your Engage trial has ended — choose a plan to continue.";
  }
  return null;
}

// A rolling approximation of "this billing period" — current_period_end
// minus one month — used only while trialing/plan-less callers never reach
// here (both gates below are skipped entirely unless plan_status is
// "active"). Good enough for a monthly cap; doesn't need to be exact to
// the day, since a business's own current_period_end is itself already an
// approximation (see the webhook's period-end-setting comment).
function currentPeriodStart(currentPeriodEnd: string | null): Date {
  const end = currentPeriodEnd ? new Date(currentPeriodEnd) : new Date();
  return new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
}

// Message-limit enforcement only applies to an active paid plan — trial
// messaging is deliberately uncapped (PLANS.md 5.6: trial is meant to let
// a business fully experience Engage, not a rationed preview).
async function checkMessageLimitGate(
  supabase: SupabaseClient,
  businessId: string,
  planId: string | null,
  currentPeriodEnd: string | null,
): Promise<string | null> {
  if (!planId) return null;

  const { data: plan } = await supabase.from("plans").select("message_limit").eq("id", planId).maybeSingle();
  if (!plan?.message_limit) return null; // null = unlimited

  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("sender_type", "ai")
    .gte("sent_at", currentPeriodStart(currentPeriodEnd).toISOString());

  if ((count ?? 0) >= plan.message_limit) {
    return `Monthly message limit (${plan.message_limit}) reached for this billing period.`;
  }
  return null;
}

// Founder instruction 2026-08-21: this cap gates notification *volume*
// only — a conversation the AI can't safely answer always escalates
// (state: human_required, always dashboard-visible) regardless of this
// check. This only decides whether that escalation also sends an active
// email/WhatsApp ping. Uncapped during trial, same reasoning as the
// message limit above.
async function isEscalationNotificationAllowed(
  supabase: SupabaseClient,
  businessId: string,
  planId: string | null,
  currentPeriodEnd: string | null,
): Promise<boolean> {
  if (!planId) return true;

  const { data: plan } = await supabase.from("plans").select("escalation_notification_limit").eq("id", planId).maybeSingle();
  if (!plan) return true;

  const { count } = await supabase
    .from("escalation_notifications")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("sent_at", currentPeriodStart(currentPeriodEnd).toISOString());

  return (count ?? 0) < plan.escalation_notification_limit;
}

// PRD §17D: merge newly-extracted fields onto the conversation, never
// clobbering a previously-captured value with a null from a later message
// that simply didn't repeat it.
async function mergeQualification(
  supabase: SupabaseClient,
  conversationId: string,
  extracted: Record<string, string | null>,
): Promise<void> {
  const { data } = await supabase.from("conversations").select("qualification").eq("id", conversationId).single();
  const existing = (data?.qualification as Record<string, string | null>) ?? {};
  const merged = { ...existing };
  for (const [key, value] of Object.entries(extracted)) {
    if (value) merged[key] = value;
  }
  await supabase.from("conversations").update({ qualification: merged }).eq("id", conversationId);
}

export type InboundResult =
  | { status: "responded"; response: string; mediaUrl: string | null }
  | { status: "escalated"; reason: string }
  | { status: "suppressed_human_active" }
  | { status: "billing_gated"; reason: string };

export async function handleInboundMessage(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  messageBody: string,
  externalMessageId?: string,
): Promise<InboundResult> {
  const customerSentAt = new Date().toISOString();
  await supabase.from("messages").insert({
    business_id: businessId,
    conversation_id: conversationId,
    sender_type: "customer",
    body: messageBody,
    external_message_id: externalMessageId ?? null,
    sent_at: customerSentAt,
  });
  // Keeps "most recent first" ordering on the dashboard honest — without
  // this, `last_message_at` stays frozen at whatever historical import (or
  // conversation creation) originally set it to, so an existing
  // conversation receiving genuinely new activity would never move toward
  // the top. Updated unconditionally here (before the human-active/
  // escalation branches below) since it should reflect real activity
  // regardless of how the message ends up handled.
  await supabase.from("conversations").update({ last_message_at: customerSentAt }).eq("id", conversationId);

  const initialStatus = await getConversationStatus(supabase, conversationId);
  if (isHumanActive(initialStatus)) {
    return { status: "suppressed_human_active" };
  }
  // Cloud-review-caught 2026-08-21 (real bug, confirmed by reading this
  // code, not taken on faith): a conversation already sitting in
  // `human_required` (escalated, but nobody has clicked Take Conversation
  // yet) is not "human active" by the check above — correctly so, since the
  // AI must keep processing a customer's further messages in case a human
  // does take over later. But that meant every subsequent message on an
  // already-escalated conversation re-triggered the escalation branch below
  // from scratch: a chatty customer sending 5-10 messages before anyone
  // responded produced 5-10 identical alert emails, each one stomping the
  // original `escalated_at` (breaking "escalated N minutes ago" / SLA
  // ordering) and the original, often more specific `escalation_reason`
  // with whatever the latest message produced. Captured here, before line
  // ~99 below unconditionally sets state to `ai_handling` for reprocessing,
  // so the escalation branch can tell a fresh escalation from a repeat one.
  const wasAlreadyEscalated = initialStatus.state === "human_required";

  // `.not("approved_at", "is", null)` is load-bearing, not a filter for
  // tidiness: vertical-template onboarding (Phase 4) seeds knowledge_items
  // with generic boilerplate no business ever confirmed. Answering from an
  // unapproved row would break the one guarantee Prevent makes — that every
  // statement to a customer came from knowledge the business approved.
  const [{ data: knowledge }, { data: business }] = await Promise.all([
    supabase
      .from("knowledge_items")
      .select("category, question, content, media_url")
      .eq("business_id", businessId)
      .not("approved_at", "is", null),
    supabase
      .from("businesses")
      .select(
        "name, escalation_keywords, knowledge_base_confirmed_complete_at, plan_id, plan_status, trial_started_at, trial_ends_at, current_period_end",
      )
      .eq("id", businessId)
      .maybeSingle(),
  ]);
  const extraEscalationKeywords = (business?.escalation_keywords as string[] | null) ?? [];
  const knowledgeBaseConfirmedCompleteAt = (business?.knowledge_base_confirmed_complete_at as string | null) ?? null;

  const billingGateReason = business
    ? checkBillingGate({
        planStatus: business.plan_status as string | null,
        trialStartedAt: business.trial_started_at as string | null,
        trialEndsAt: business.trial_ends_at as string | null,
        currentPeriodEnd: business.current_period_end as string | null,
      })
    : null;
  // Message is already stored (above) — a billing gate (trial expired,
  // subscription lapsed, or the message-limit cap below) never loses a
  // real customer message, only stops the AI from responding. Flagged for
  // a human via the same human_required visibility the dashboard already
  // renders, tagged so it reads distinctly from a genuine safety
  // escalation. Deliberately does NOT call sendEscalationNotification or
  // count against escalation_notifications — this isn't a safety
  // escalation, and must never compete with or be throttled by that tier
  // limit. If the conversation already carries a real safety
  // escalation_reason, that takes precedence and is left untouched.
  async function applyBillingGate(reason: string): Promise<InboundResult> {
    await supabase
      .from("conversations")
      .update(
        wasAlreadyEscalated
          ? { state: "human_required" }
          : { state: "human_required", escalation_reason: `Billing: ${reason}` },
      )
      .eq("id", conversationId);
    return { status: "billing_gated", reason };
  }

  if (billingGateReason) return applyBillingGate(billingGateReason);

  const messageLimitReason =
    business?.plan_status === "active"
      ? await checkMessageLimitGate(
          supabase,
          businessId,
          (business.plan_id as string | null) ?? null,
          (business.current_period_end as string | null) ?? null,
        )
      : null;
  if (messageLimitReason) return applyBillingGate(messageLimitReason);

  await supabase.from("conversations").update({ state: "ai_handling" }).eq("id", conversationId);

  const result = await processInboundMessage(
    messageBody,
    knowledge ?? [],
    extraEscalationKeywords,
    knowledgeBaseConfirmedCompleteAt,
  );

  // Re-check immediately before committing — this is the actual kill
  // switch, not the pre-check above (which only prevents starting new work
  // on an already-human conversation, not a takeover mid-flight).
  if (isHumanActive(await getConversationStatus(supabase, conversationId))) {
    return { status: "suppressed_human_active" };
  }

  if (result?.qualification) {
    await mergeQualification(supabase, conversationId, result.qualification);
  }

  // Addendum §11's five-condition safe-response gate, formalized as one
  // named, auditable function (`evaluateSafeResponseGate`) rather than an
  // ad hoc field check — this is the actual respond-or-escalate decision,
  // re-run here independent of engine.ts's own internal defense-in-depth
  // check, since this is the point where a "safe" verdict turns into a real
  // customer-facing send (addendum §7: "safe incompleteness over confident
  // wrongness"). `!result` (a schema-non-conformant model output) escalates
  // by the same logic as a tier D verdict.
  const validMediaUrls = new Set((knowledge ?? []).map((k) => k.media_url).filter((u): u is string => !!u));
  const gate = result
    ? evaluateSafeResponseGate(result, validMediaUrls)
    : { safe: false as const, reason: "could not generate a response from approved knowledge" };
  if (!gate.safe) {
    const reason = gate.reason;

    if (wasAlreadyEscalated) {
      // Re-escalation of a conversation that's already `human_required` and
      // still not taken — restore state (the unconditional update above set
      // it to `ai_handling` so the engine could run) without resetting the
      // original `escalated_at`/`escalation_reason` or re-sending the alert.
      // Without this, a chatty customer sending several messages before
      // anyone responds would reset the SLA clock every time and flood the
      // same human inbox with one identical-looking email per message.
      await supabase.from("conversations").update({ state: "human_required" }).eq("id", conversationId);
      return { status: "escalated", reason };
    }

    await supabase
      .from("conversations")
      .update({ state: "human_required", escalation_reason: reason, escalated_at: new Date().toISOString() })
      .eq("id", conversationId);

    // Founder request 2026-08-21: nobody was pinged when a conversation
    // escalated before this — a human had to already be looking at the
    // dashboard to notice. Awaited directly (not fire-and-forget): the real
    // webhook route already wraps this whole function in `after()` at the
    // route level, so this doesn't delay Meta's own response; for the
    // Simulate-form caller it adds a small, acceptable delay to an
    // admin-only testing tool. Never throws — see the module's own comment
    // for why a notification failure must never break the escalation itself.
    const { data: conv } = await supabase
      .from("conversations")
      .select("customer_id")
      .eq("id", conversationId)
      .maybeSingle();
    const { data: customer } = conv?.customer_id
      ? await supabase.from("customers").select("name").eq("id", conv.customer_id).maybeSingle()
      : { data: null };

    // Founder instruction 2026-08-21: this only caps whether a notification
    // is *sent* — the escalation above already happened and is already
    // dashboard-visible regardless of this check. Uncapped during trial.
    const notificationAllowed =
      business?.plan_status === "active"
        ? await isEscalationNotificationAllowed(
            supabase,
            businessId,
            (business.plan_id as string | null) ?? null,
            (business.current_period_end as string | null) ?? null,
          )
        : true;

    if (notificationAllowed) {
      await sendEscalationNotification({
        businessId,
        businessName: (business?.name as string | null) ?? "Your business",
        customerName: (customer?.name as string | null) ?? null,
        escalationReason: reason,
        conversationUrl: `${getSiteUrl()}/dashboard/engage`,
      });
      await supabase.from("escalation_notifications").insert({ business_id: businessId, conversation_id: conversationId });
    }

    return { status: "escalated", reason };
  }

  const aiSentAt = new Date().toISOString();
  await supabase.from("messages").insert({
    business_id: businessId,
    conversation_id: conversationId,
    sender_type: "ai",
    body: gate.response,
    sent_at: aiSentAt,
  });
  await supabase.from("conversations").update({ state: "ai_handling", last_message_at: aiSentAt }).eq("id", conversationId);
  return { status: "responded", response: gate.response, mediaUrl: gate.mediaUrl };
}

// PRD §23: selecting "Take Conversation" stops AI immediately. This is the
// only thing that sets human_taken_at — the single source of truth the
// kill switch checks.
export async function takeConversation(
  supabase: SupabaseClient,
  conversationId: string,
  assignedTo: string,
): Promise<void> {
  await supabase
    .from("conversations")
    .update({ state: "human_handling", human_taken_at: new Date().toISOString(), assigned_to: assignedTo })
    .eq("id", conversationId);
}

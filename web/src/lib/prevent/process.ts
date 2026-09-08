import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processInboundMessage } from "./engine";
import { evaluateSafeResponseGate } from "./safe-response-gate";
import { sendEscalationNotification } from "@/lib/notifications/escalation-email";
import { sendEscalationWhatsApp } from "@/lib/notifications/escalation-whatsapp";
import { getSiteUrl } from "@/lib/site-url";
import { RESUME_AFTER_SILENCE_MINUTES } from "./timers";
import { decryptToken } from "@/lib/channels/token-crypto";
import { sendMessage, sendMediaMessage, inferMediaType } from "@/lib/channels/instagram-api";

// The kill switch (PRD §23: "when a human takes over, AI stops") is
// enforced here, not just hidden behind a UI button — a conversation is
// re-checked for human takeover both BEFORE starting AI processing and
// AGAIN immediately before the AI's response is committed, discarding the
// response if a human took over while the model was "thinking" (a real
// generateObject call takes ~1-2s, a realistic window for this race).
// Tested directly against that race in TESTS.md, not just reasoned about.
//
// Founder decision 2026-09-07: no longer literally permanent. A human
// taking over still stops the AI immediately, but if the team goes quiet
// on a customer's message for RESUME_AFTER_SILENCE_MINUTES (timers.ts),
// resumeSilentConversation() below releases the claim (clears
// human_taken_at/assigned_to, moves state off human_handling) and replays
// the still-unanswered message through the exact same
// processConversationMessage() a live webhook message goes through —
// deliberately not a separate, parallel code path that could drift from
// it. Terms & Privacy and the homepage FAQ were updated to match — "stops
// automated replies" is no longer an unconditional "permanently".

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
// Exported so admin's per-business billing detail (2026-08-21) can show
// "this period's usage" against the exact same window the enforcement
// gates actually use, instead of a second approximation that could drift.
export function currentPeriodStart(currentPeriodEnd: string | null): Date {
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

// Founder decision 2026-08-25: this used to gate notification *volume* —
// after N events in a billing period, further escalations went silent
// (dashboard-only). Replaced: an escalation the AI can't safely answer
// always escalates AND always notifies now; this instead resolves how many
// team members (in role-priority order — see escalation-email.ts) hear
// about each one, which is what plans.escalation_notification_limit now
// means. Uncapped (returns null = every member) with no plan, same
// reasoning as the message limit above.
async function resolveEscalationRecipientLimit(supabase: SupabaseClient, planId: string | null): Promise<number | null> {
  if (!planId) return null;
  const { data: plan } = await supabase.from("plans").select("escalation_notification_limit").eq("id", planId).maybeSingle();
  return plan?.escalation_notification_limit ?? null;
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

  return processConversationMessage(supabase, businessId, conversationId, messageBody);
}

// Extracted 2026-09-07 from handleInboundMessage so resumeSilentConversation
// (below) replays an already-stored, still-unanswered message through the
// exact same respond/escalate logic a live webhook message goes through,
// rather than a second, parallel implementation that could drift from it.
// Callers are responsible for the message already existing in `messages`
// and for `conversations.last_message_at` already being current —
// handleInboundMessage does both before calling this; resumeSilentConversation
// does neither, since the message it's replaying is already stored.
async function processConversationMessage(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  messageBody: string,
): Promise<InboundResult> {
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
      .select("customer_id, channel")
      .eq("id", conversationId)
      .maybeSingle();
    const { data: customer } = conv?.customer_id
      ? await supabase.from("customers").select("name").eq("id", conv.customer_id).maybeSingle()
      : { data: null };

    // Founder decision 2026-08-25: every escalation notifies now — no
    // monthly cap on whether it happens at all. What the plan controls is
    // how many team members hear about it (see resolveEscalationRecipientLimit
    // / getBusinessRecipientEmails's role-priority ordering). Unlimited
    // (every member) when not on an active plan (trial/unbilled).
    const recipientLimit =
      business?.plan_status === "active" ? await resolveEscalationRecipientLimit(supabase, (business.plan_id as string | null) ?? null) : null;

    await sendEscalationNotification({
      businessId,
      businessName: (business?.name as string | null) ?? "Your business",
      customerName: (customer?.name as string | null) ?? null,
      escalationReason: reason,
      messageBody,
      conversationUrl: `${getSiteUrl()}/dashboard/engage`,
      recipientLimit,
    });
    // Additive alongside email, never a replacement — see
    // lib/notifications/escalation-whatsapp.ts's own comment for why this
    // has to be a template send, not plain text.
    await sendEscalationWhatsApp({
      businessId,
      customerName: (customer?.name as string | null) ?? null,
      channel: (conv?.channel as string | null) ?? "other",
      messageBody,
      conversationUrl: `${getSiteUrl()}/dashboard/engage`,
      recipientLimit,
    });
    // Historical record that a notification was sent for this escalation —
    // no longer read to gate anything (that's the whole point of this
    // change), kept as an audit trail, same append-only spirit as `payments`.
    await supabase.from("escalation_notifications").insert({ business_id: businessId, conversation_id: conversationId });

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

// Founder decision 2026-09-07 — see this file's top-of-file note. Called by
// the resume-after-silence cron (api/cron/resume-after-silence) for a
// conversation it already confirmed is `human_handling` with its latest
// message from the customer, unanswered for
// RESUME_AFTER_SILENCE_MINUTES+ (lib/prevent/timers.ts). Releases the human
// claim and flips state off `human_handling` BEFORE calling
// processConversationMessage, so that function's own isHumanActive() check
// (identical to a live message's) naturally proceeds rather than needing a
// bypass flag — resuming is "un-claim it, then let it go through the exact
// same pipeline as any other message." A visible `system` message marks
// the moment for the team, so it's never a silent handoff back to the AI.
export async function resumeSilentConversation(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
): Promise<InboundResult> {
  const { data: latestMessage } = await supabase
    .from("messages")
    .select("body")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Cron's own query already filters to conversations whose latest message
  // is from the customer — a missing/bodyless message here would mean that
  // filter and this read raced against a new message arriving in between.
  // Nothing to resume with in that case; the next cron pass re-evaluates.
  if (!latestMessage?.body) return { status: "suppressed_human_active" };

  await supabase
    .from("conversations")
    .update({ human_taken_at: null, assigned_to: null, state: "ai_handling" })
    .eq("id", conversationId);
  await supabase.from("messages").insert({
    business_id: businessId,
    conversation_id: conversationId,
    sender_type: "system",
    body: `Engage resumed after ${RESUME_AFTER_SILENCE_MINUTES} minutes with no reply from your team.`,
    sent_at: new Date().toISOString(),
  });

  const result = await processConversationMessage(supabase, businessId, conversationId, latestMessage.body);

  // processConversationMessage only decides and stores what the AI would
  // say — dispatching it to the actual customer is normally the inbound
  // webhook's job (api/channels/instagram/webhook/route.ts, right after its
  // own handleInboundMessage call) because a fresh webhook request always
  // has one to send from. This code path has no such caller, so a resumed
  // "responded" result has to send itself, or the customer would see the
  // reply sitting in the dashboard forever and never actually receive it.
  if (result.status === "responded") {
    await dispatchResponse(supabase, businessId, conversationId, result.response, result.mediaUrl);
  }

  return result;
}

async function dispatchResponse(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  response: string,
  mediaUrl: string | null,
): Promise<void> {
  const { data: conversation } = await supabase
    .from("conversations")
    .select("channel, customer_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (conversation?.channel !== "instagram") return; // WhatsApp isn't live yet — same gap sendHumanReply has.

  const { data: customer } = await supabase
    .from("customers")
    .select("external_customer_id")
    .eq("id", conversation.customer_id)
    .maybeSingle();
  if (!customer?.external_customer_id) return;

  const { data: connection } = await supabase
    .from("channel_connections")
    .select("access_token_encrypted, external_account_id")
    .eq("business_id", businessId)
    .eq("channel", "instagram")
    .is("disconnected_at", null)
    .maybeSingle();
  if (!connection) return;

  const accessToken = decryptToken(connection.access_token_encrypted);
  await sendMessage(accessToken, connection.external_account_id, customer.external_customer_id, response);
  if (mediaUrl) {
    await sendMediaMessage(
      accessToken,
      connection.external_account_id,
      customer.external_customer_id,
      mediaUrl,
      inferMediaType(mediaUrl),
    );
  }
}

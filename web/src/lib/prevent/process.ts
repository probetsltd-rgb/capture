import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processInboundMessage } from "./engine";
import { evaluateSafeResponseGate } from "./safe-response-gate";
import { sendEscalationNotification } from "@/lib/notifications/escalation-email";
import { sendEscalationWhatsApp } from "@/lib/notifications/escalation-whatsapp";
import { notifyHandler } from "@/lib/notifications/handler-notification";
import { getSiteUrl } from "@/lib/site-url";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { decryptToken } from "@/lib/channels/token-crypto";
import { sendMessage as sendInstagramMessage, sendMediaMessage as sendInstagramMedia, inferMediaType as inferInstagramMediaType } from "@/lib/channels/instagram-api";
import { sendMessage as sendWhatsAppMessage, sendMediaMessage as sendWhatsAppMedia, inferMediaType as inferWhatsAppMediaType } from "@/lib/channels/whatsapp-api";

// The kill switch (PRD §23: "when a human takes over, AI stops") is
// enforced here, not just hidden behind a UI button — a conversation is
// re-checked for human takeover both BEFORE starting AI processing and
// AGAIN immediately before the AI's response is committed, discarding the
// response if a human took over while the model was "thinking" (a real
// generateObject call takes ~1-2s, a realistic window for this race).
// Tested directly against that race in TESTS.md, not just reasoned about.
//
// Founder decision 2026-09-07, reversed 2026-09-14: for one week this was
// "no longer literally permanent" — a silent team resumed AI after
// RESUME_AFTER_SILENCE_MINUTES. Reverted: the AI has no way to know what a
// handler already said off-script, so silently picking the conversation
// back up risked contradicting or duplicating a human reply it never saw.
// The kill switch is permanent again by default — once human_handling,
// nothing automatic changes that. What DID survive from that decision: a
// customer's reply now proactively pings the assigned handler (see the
// isHumanActive branch below and lib/notifications/handler-notification.ts),
// plus a one-time reminder if they're still quiet after
// HANDLER_REMINDER_MINUTES (timers.ts, api/cron/handler-reminders) —
// escalating the human, never resuming the AI on its own. Terms & Privacy
// and the homepage FAQ were updated back to match. A human CAN still hand a
// conversation back explicitly, though — releaseToAI() below, wired to a
// "Release to AI" button, added the same day once the founder asked for it.

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

async function processConversationMessage(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  messageBody: string,
): Promise<InboundResult> {
  const initialStatus = await getConversationStatus(supabase, conversationId);
  if (isHumanActive(initialStatus)) {
    // Founder decision 2026-09-14: the AI stays suppressed (see this file's
    // top-of-file note) — but the assigned handler should hear about this
    // the moment it happens, not whenever they next happen to check the
    // dashboard. Only fires for state === "human_handling" specifically
    // (not the human_taken_at-without-state edge isHumanActive also covers,
    // which shouldn't occur in practice — takeConversation always sets both
    // together — but would have no assignee to notify if it somehow did).
    // handler_reminder_sent_at resets here too: this is a fresh unanswered
    // message, so any reminder already sent for an earlier one in this same
    // conversation must not suppress a genuinely new reminder cycle later.
    if (initialStatus.state === "human_handling") {
      const { data: conv } = await supabase
        .from("conversations")
        .select("customer_id, channel, assigned_to")
        .eq("id", conversationId)
        .maybeSingle();
      if (conv?.assigned_to) {
        await supabase.from("conversations").update({ handler_reminder_sent_at: null }).eq("id", conversationId);
        const { data: customer } = conv.customer_id
          ? await supabase.from("customers").select("name").eq("id", conv.customer_id).maybeSingle()
          : { data: null };
        await notifyHandler({
          businessId,
          assignedTo: conv.assigned_to,
          customerName: (customer?.name as string | null) ?? null,
          channel: conv.channel as string,
          messageBody,
          conversationUrl: `${getSiteUrl()}/dashboard/engage`,
          kind: "reply",
        });
      }
    }
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
    .update({
      state: "human_handling",
      human_taken_at: new Date().toISOString(),
      assigned_to: assignedTo,
      handler_reminder_sent_at: null, // fresh claim, fresh reminder cycle
    })
    .eq("id", conversationId);
}

// Founder decision 2026-09-14 — see this file's top-of-file note. Called by
// the handler-reminders cron (api/cron/handler-reminders) for a conversation
// it already confirmed is `human_handling` with its latest message from the
// customer, unanswered for HANDLER_REMINDER_MINUTES+ and not yet reminded
// for this unanswered message (lib/prevent/timers.ts). Unlike its
// predecessor (resumeSilentConversation, removed alongside this), this never
// touches human_taken_at/assigned_to/state — the AI stays suppressed; this
// only re-notifies the assigned handler and marks the reminder sent so the
// next cron pass doesn't repeat it for the same message.
export async function sendHandlerReminder(supabase: SupabaseClient, businessId: string, conversationId: string): Promise<void> {
  const { data: conv } = await supabase
    .from("conversations")
    .select("customer_id, channel, assigned_to")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv?.assigned_to) return;

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
  // Nothing to remind about in that case; the next cron pass re-evaluates.
  if (!latestMessage?.body) return;

  const { data: customer } = conv.customer_id
    ? await supabase.from("customers").select("name").eq("id", conv.customer_id).maybeSingle()
    : { data: null };

  await notifyHandler({
    businessId,
    assignedTo: conv.assigned_to,
    customerName: (customer?.name as string | null) ?? null,
    channel: conv.channel as string,
    messageBody: latestMessage.body,
    conversationUrl: `${getSiteUrl()}/dashboard/engage`,
    kind: "reminder",
  });

  await supabase.from("conversations").update({ handler_reminder_sent_at: new Date().toISOString() }).eq("id", conversationId);
}

// Founder request 2026-09-14: the kill switch above is permanent by
// default, but a handler needs a deliberate way to hand a resolved-or-stuck
// conversation back to Engage rather than it staying human-owned forever
// with no release path. Unlike the old, automatic resumeSilentConversation
// (removed earlier the same day) this is always an explicit human action —
// never a timer — so there's no risk of the AI reclaiming a conversation
// mid-negotiation without anyone deciding that's what should happen.
//
// Reads the latest message BEFORE writing anything: if it's still an
// unanswered customer message, that's exactly what resumeSilentConversation
// used to replay, so the customer gets a real answer immediately rather
// than waiting for their next message; if the team already replied (or
// there's nothing yet), releasing is a pure state change with nothing to
// answer. Inserting the visible `system` marker before that replay (rather
// than after) mirrors resumeSilentConversation's own ordering — the note
// that Engage was reactivated should read as happening before whatever it
// says immediately after.
export async function releaseToAI(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
): Promise<InboundResult> {
  const { data: latestMessage } = await supabase
    .from("messages")
    .select("sender_type, body")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase
    .from("conversations")
    .update({ human_taken_at: null, assigned_to: null, handler_reminder_sent_at: null, state: "ai_handling" })
    .eq("id", conversationId);
  await supabase.from("messages").insert({
    business_id: businessId,
    conversation_id: conversationId,
    sender_type: "system",
    body: "Your team released this conversation back to Engage.",
    sent_at: new Date().toISOString(),
  });

  if (latestMessage?.sender_type !== "customer" || !latestMessage.body) {
    return { status: "suppressed_human_active" }; // nothing unanswered to reprocess — release is complete as-is
  }

  const result = await processConversationMessage(supabase, businessId, conversationId, latestMessage.body);

  // Same reasoning resumeSilentConversation had: processConversationMessage
  // only decides and stores what the AI would say — a live webhook request
  // normally dispatches the reply itself right after calling it. This call
  // site has no such caller, so a "responded" result has to send itself, or
  // the customer would see the reply sitting in the dashboard and never
  // actually receive it.
  if (result.status === "responded") {
    await dispatchResponse(businessId, conversationId, result.response, result.mediaUrl);
  }

  return result;
}

// Dispatches an AI response generated outside the normal webhook request
// (currently only releaseToAI above) to the customer on their real channel.
// Handles both Instagram and WhatsApp — unlike its now-removed predecessor,
// which only ever supported Instagram (written before WhatsApp ingestion
// existed); parity with sendHumanReply's own two branches (human-reply.ts),
// which have supported both since DEV-35.
//
// Deliberately instantiates its own service-role client rather than using
// whatever `supabase` was passed to releaseToAI — channel_connections has
// zero RLS policies for `authenticated` by design (its own migration's
// header comment: holds an OAuth token, so only the service-role client
// can read it at all). releaseToAI can be called with either an
// RLS-scoped session client (from the dashboard's server action, same as
// takeConversation/closeConversation) or a service-role one; using the
// passed-in client here would silently no-op on the RLS-scoped path
// (`.maybeSingle()` returning nothing, not an error) rather than actually
// sending the reply — the same discipline sendHumanReply, sendEscalation-
// Notification, and sendEscalationWhatsApp already each follow for exactly
// this reason.
async function dispatchResponse(
  businessId: string,
  conversationId: string,
  response: string,
  mediaUrl: string | null,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("channel, customer_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation?.customer_id) return;

  const { data: customer } = await supabase
    .from("customers")
    .select("external_customer_id")
    .eq("id", conversation.customer_id)
    .maybeSingle();
  if (!customer?.external_customer_id) return;

  const channel = conversation.channel as string;
  if (channel !== "instagram" && channel !== "whatsapp") return;

  const { data: connection } = await supabase
    .from("channel_connections")
    .select("access_token_encrypted, external_account_id")
    .eq("business_id", businessId)
    .eq("channel", channel)
    .is("disconnected_at", null)
    .maybeSingle();
  if (!connection) return;

  const accessToken = decryptToken(connection.access_token_encrypted);
  const send = channel === "instagram" ? sendInstagramMessage : sendWhatsAppMessage;
  const sendMedia = channel === "instagram" ? sendInstagramMedia : sendWhatsAppMedia;
  const inferMediaType = channel === "instagram" ? inferInstagramMediaType : inferWhatsAppMediaType;

  await send(accessToken, connection.external_account_id, customer.external_customer_id, response);
  if (mediaUrl) {
    await sendMedia(accessToken, connection.external_account_id, customer.external_customer_id, mediaUrl, inferMediaType(mediaUrl));
  }
}

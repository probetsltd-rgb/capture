"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  isEligibleForCampaign,
  computeScheduledAt,
  computePriorityScore,
  canLogAnotherContact,
  isTerminal,
  type OpportunityForRules,
} from "@/lib/recover/rules";
import { generateOutreachDraft } from "@/lib/recover/draft-message";
import { mapWithConcurrency } from "@/lib/concurrency";

// Moved 2026-08-15 from app/admin/recover/[businessId]/actions.ts as part
// of the route restructure (PLANS.md Phase 5.0) — now the one canonical
// copy, reachable from both /admin/recover/[businessId] (founder) and
// /dashboard/recover (business owner, no businessId in the URL). All
// actions here run through the AUTHENTICATED server client — RLS
// (platform_admins / business_members) governs access, not an implicit
// "this is an admin route" assumption. A non-member calling these gets
// zero rows back and every write silently affects nothing.

export type ActionResult = { ok: boolean; message: string };

// Bounded — an AI call per opportunity, same rate-limit-cliff reasoning as
// upload/[token]/actions.ts's classification pool (TESTS.md DEV-7).
const DRAFT_CONCURRENCY = 5;

function revalidateRecoverPaths(businessId: string) {
  revalidatePath(`/admin/recover/${businessId}`);
  revalidatePath("/dashboard/recover");
}

// PRD §12 workflow: Identify -> Score -> Determine timing -> (send). We
// stop at "queued" — see src/lib/recover/rules.ts's header comment and
// OUTSTANDINGS.md for why: outbound WhatsApp send is blocked on DEP-1/DEP-2,
// so a human executes the actual contact and the app tracks state around it.
// As of 2026-08-13, "queued" now includes an AI-drafted message per
// opportunity (not just scheduling metadata) — a founder caught that
// campaigns previously only surfaced opportunities without ever drafting
// anything a human could actually send.
export async function startCampaign(businessId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const [{ data: business }, { data: opportunities, error }] = await Promise.all([
    supabase.from("businesses").select("name").eq("id", businessId).maybeSingle(),
    supabase
      .from("opportunities")
      .select("id, type, intent, estimated_value, status, source_conversation_id")
      .eq("business_id", businessId),
  ]);

  if (error) return { ok: false, message: "Could not load opportunities." };
  if (!business) return { ok: false, message: "Could not load business — check you have access." };

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, last_message_at, leakage_type")
    .eq("business_id", businessId);
  const lastMessageById = new Map((conversations ?? []).map((c) => [c.id, c.last_message_at]));
  const leakageTypeById = new Map((conversations ?? []).map((c) => [c.id, c.leakage_type]));

  const eligible = (opportunities ?? []).filter((o) => isEligibleForCampaign(o));
  if (eligible.length === 0) {
    return { ok: false, message: "No eligible opportunities to queue — all have already been actioned." };
  }

  const conversationIds = eligible
    .map((o) => o.source_conversation_id)
    .filter((id): id is string => id !== null);
  const { data: messages } = conversationIds.length
    ? await supabase
        .from("messages")
        .select("conversation_id, sender_type, body, sent_at")
        .in("conversation_id", conversationIds)
        .order("sent_at", { ascending: true })
    : { data: [] as { conversation_id: string; sender_type: string; body: string | null; sent_at: string }[] };
  const messagesByConversation = new Map<string, { sender_type: string; body: string | null }[]>();
  for (const m of messages ?? []) {
    const list = messagesByConversation.get(m.conversation_id) ?? [];
    list.push({ sender_type: m.sender_type, body: m.body });
    messagesByConversation.set(m.conversation_id, list);
  }

  const maxValue = Math.max(0, ...opportunities!.map((o) => o.estimated_value ?? 0));

  // Draft generation isolated per-opportunity, same as classification
  // (TESTS.md DEV-7) — one bad/slow model call must not stop the rest of
  // the batch from queuing. A failed draft leaves draft_message null; the
  // opportunity is still queued and usable, just without a suggested message.
  const draftByOpportunity = new Map<string, string | null>();
  await mapWithConcurrency(eligible, DRAFT_CONCURRENCY, async (o) => {
    const convMessages = o.source_conversation_id ? messagesByConversation.get(o.source_conversation_id) : undefined;
    if (!convMessages || convMessages.length === 0) return;
    try {
      const draft = await generateOutreachDraft({
        businessName: business.name,
        leakageType: (o.source_conversation_id ? leakageTypeById.get(o.source_conversation_id) : null) ?? "other",
        messages: convMessages,
      });
      draftByOpportunity.set(o.id, draft);
    } catch (err) {
      console.error(`Draft generation failed for opportunity ${o.id}:`, err);
    }
  });

  const rows = eligible.map((o) => {
    const forRules: OpportunityForRules = {
      id: o.id,
      type: o.type,
      intent: o.intent,
      estimated_value: o.estimated_value,
      status: o.status,
      conversationLastMessageAt: o.source_conversation_id
        ? (lastMessageById.get(o.source_conversation_id) ?? null)
        : null,
    };
    const scheduledAt = computeScheduledAt(forRules);
    const score = computePriorityScore(forRules, maxValue);
    return {
      business_id: businessId,
      opportunity_id: o.id,
      trigger: `recover:${o.type}`,
      action: `priority_score=${score}`,
      status: "pending" as const,
      scheduled_at: scheduledAt.toISOString(),
      draft_message: draftByOpportunity.get(o.id) ?? null,
    };
  });

  const { error: insertError } = await supabase.from("automations").insert(rows);
  if (insertError) return { ok: false, message: "Could not queue the campaign." };

  revalidateRecoverPaths(businessId);
  const draftedCount = rows.filter((r) => r.draft_message).length;
  return {
    ok: true,
    message: `Queued ${rows.length} opportunit${rows.length === 1 ? "y" : "ies"} for recovery outreach — ${draftedCount} with a suggested message ready below.`,
  };
}

// A human has actually messaged the customer via WhatsApp themselves.
// Enforces the one-further-follow-up-max guardrail (PRD §12) — this is the
// point where an automated "send" would happen once DEP-1/DEP-2 clear;
// for now a human confirms they did it.
export async function markContacted(opportunityId: string, businessId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const [{ data: existing }, { data: business }, { data: opportunity }] = await Promise.all([
    supabase
      .from("automations")
      .select("id")
      .eq("opportunity_id", opportunityId)
      .in("status", ["sent", "responded", "completed"]),
    supabase.from("businesses").select("max_recover_followups").eq("id", businessId).maybeSingle(),
    supabase.from("opportunities").select("status").eq("id", opportunityId).maybeSingle(),
  ]);

  if (!opportunity) {
    return { ok: false, message: "Opportunity not found — check you have access to this business." };
  }

  // PRD §32/§12: once a customer has responded (or the outcome is settled),
  // outreach stops permanently. Previously this was enforced only by the UI
  // not rendering a button, which is not enforcement — the action is
  // directly callable.
  if (isTerminal(opportunity.status)) {
    return {
      ok: false,
      message: "This customer has already responded — no further outreach (PRD §32).",
    };
  }

  const maxFollowups = business?.max_recover_followups ?? undefined;
  if (!canLogAnotherContact(existing?.length ?? 0, maxFollowups)) {
    return { ok: false, message: "Follow-up limit reached for this opportunity — do not contact again (PRD §12)." };
  }

  const { data: automation } = await supabase
    .from("automations")
    .select("id")
    .eq("opportunity_id", opportunityId)
    .eq("status", "pending")
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (automation) {
    await supabase
      .from("automations")
      .update({ status: "sent", executed_at: new Date().toISOString() })
      .eq("id", automation.id);
  } else {
    // Logging a follow-up beyond the original queued automation.
    await supabase.from("automations").insert({
      business_id: businessId,
      opportunity_id: opportunityId,
      trigger: "recover:manual_followup",
      action: "manual_followup",
      status: "sent",
      executed_at: new Date().toISOString(),
    });
  }

  await supabase.from("opportunities").update({ status: "contacted" }).eq("id", opportunityId);
  revalidateRecoverPaths(businessId);
  return { ok: true, message: "Marked as contacted." };
}

// PRD §32/§12: the moment a customer responds, automation stops. Any
// pending automations for this opportunity are stopped explicitly, not
// just ignored, so the state is auditable.
export async function markResponded(opportunityId: string, businessId: string): Promise<ActionResult> {
  const supabase = await createClient();

  await supabase
    .from("automations")
    .update({ status: "stopped" })
    .eq("opportunity_id", opportunityId)
    .eq("status", "pending");

  await supabase.from("opportunities").update({ status: "responded" }).eq("id", opportunityId);
  revalidateRecoverPaths(businessId);
  return { ok: true, message: "Marked as responded. Automation stopped for this opportunity." };
}

// PRD §14: deliberately simple manual attribution — Won / Lost / Not sure,
// revenue entered manually. No sophisticated attribution modeling in V1.
export async function recordOutcome(
  opportunityId: string,
  businessId: string,
  outcome: "won" | "lost" | "not_sure",
  revenue: number | null,
): Promise<ActionResult> {
  if (outcome === "won" && (revenue === null || revenue <= 0)) {
    return { ok: false, message: "Enter the actual revenue for a Won opportunity." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunities")
    .update({
      status: outcome,
      actual_revenue: outcome === "won" ? revenue : null,
    })
    .eq("id", opportunityId);

  if (error) return { ok: false, message: "Could not record the outcome." };

  revalidateRecoverPaths(businessId);
  return { ok: true, message: "Outcome recorded." };
}

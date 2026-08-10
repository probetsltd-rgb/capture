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

// All actions here run through the AUTHENTICATED server client, same as
// /admin itself — RLS (platform_admins / business_members) governs access,
// not an implicit "this is an admin route" assumption. A non-admin calling
// these gets zero rows back and every write silently affects nothing,
// exactly like the rest of the app.

export type ActionResult = { ok: boolean; message: string };

// PRD §12 workflow: Identify -> Score -> Determine timing -> (send). We
// stop at "queued" — see src/lib/recover/rules.ts's header comment and
// OUTSTANDINGS.md for why: outbound WhatsApp send is blocked on DEP-1/DEP-2,
// so a human executes the actual contact and the app tracks state around it.
export async function startCampaign(businessId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select("id, type, intent, estimated_value, status, source_conversation_id")
    .eq("business_id", businessId);

  if (error) return { ok: false, message: "Could not load opportunities." };

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, last_message_at")
    .eq("business_id", businessId);
  const lastMessageById = new Map((conversations ?? []).map((c) => [c.id, c.last_message_at]));

  const eligible = (opportunities ?? []).filter((o) => isEligibleForCampaign(o));
  if (eligible.length === 0) {
    return { ok: false, message: "No eligible opportunities to queue — all have already been actioned." };
  }

  const maxValue = Math.max(0, ...opportunities!.map((o) => o.estimated_value ?? 0));

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
    };
  });

  const { error: insertError } = await supabase.from("automations").insert(rows);
  if (insertError) return { ok: false, message: "Could not queue the campaign." };

  revalidatePath(`/admin/recover/${businessId}`);
  return { ok: true, message: `Queued ${rows.length} opportunity/opportunities for recovery outreach.` };
}

// A human has actually messaged the customer via WhatsApp themselves.
// Enforces the one-further-follow-up-max guardrail (PRD §12) — this is the
// point where an automated "send" would happen once DEP-1/DEP-2 clear;
// for now a human confirms they did it.
export async function markContacted(opportunityId: string, businessId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const [{ data: existing }, { data: business }] = await Promise.all([
    supabase
      .from("automations")
      .select("id")
      .eq("opportunity_id", opportunityId)
      .in("status", ["sent", "responded", "completed"]),
    supabase.from("businesses").select("max_recover_followups").eq("id", businessId).maybeSingle(),
  ]);

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
  revalidatePath(`/admin/recover/${businessId}`);
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
  revalidatePath(`/admin/recover/${businessId}`);
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

  revalidatePath(`/admin/recover/${businessId}`);
  return { ok: true, message: "Outcome recorded." };
}

export { isTerminal };

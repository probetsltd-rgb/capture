"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { updatePaystackPlanAmount } from "@/lib/payments/paystack";

export type ActionResult = { ok: boolean; message: string };

// Founder instruction 2026-08-21: every tier number (price, message limit,
// escalation-notification limit) must be admin-editable, never hardcoded —
// this is what makes that real. RLS (plans_write/app_settings_write,
// internal.is_platform_admin()) is the actual access control here, not
// this file — a non-admin authenticated user's write is silently denied by
// Postgres, same discipline as every other write in this app.
//
// Founder question, same date: this table's price is display data — actual
// checkout amount is driven by the linked Paystack Plan (paystack_plan_code),
// which is a *separate* number on Paystack's side. If a plan code is set,
// Paystack must accept the new amount BEFORE this row is saved, so the two
// can never silently diverge in either direction — see
// lib/payments/paystack.ts's updatePaystackPlanAmount for why
// update_existing_subscriptions is deliberately false (a price change
// shouldn't reprice someone already subscribed at the old rate).
export async function updatePlan(
  planId: string,
  updates: { priceKobo: number; messageLimit: number | null; escalationNotificationLimit: number; hasAnalytics: boolean; paystackPlanCode: string | null },
): Promise<ActionResult> {
  const supabase = await createClient();

  if (updates.paystackPlanCode) {
    try {
      await updatePaystackPlanAmount(updates.paystackPlanCode, updates.priceKobo);
    } catch (error) {
      console.error("Paystack plan sync failed", error);
      return {
        ok: false,
        message: "Could not sync this price with Paystack — nothing was saved. Check the plan code is correct.",
      };
    }
  }

  const { data, error } = await supabase
    .from("plans")
    .update({
      price_kobo: updates.priceKobo,
      message_limit: updates.messageLimit,
      escalation_notification_limit: updates.escalationNotificationLimit,
      has_analytics: updates.hasAnalytics,
      paystack_plan_code: updates.paystackPlanCode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId)
    .select("id");

  if (error) return { ok: false, message: "Could not update — please try again." };
  if (!data || data.length === 0) return { ok: false, message: "Could not update — admin access required." };

  revalidatePath("/admin/plans");
  return {
    ok: true,
    message: updates.paystackPlanCode ? "Plan updated — Paystack price synced." : "Plan updated.",
  };
}

export async function updateTrialDays(trialDays: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .update({ value: String(trialDays), updated_at: new Date().toISOString() })
    .eq("key", "trial_days")
    .select("key");

  if (error) return { ok: false, message: "Could not update — please try again." };
  if (!data || data.length === 0) return { ok: false, message: "Could not update — admin access required." };

  revalidatePath("/admin/plans");
  return { ok: true, message: "Trial length updated." };
}

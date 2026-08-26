"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

// RLS (recover_plans_write, internal.is_platform_admin()) is the actual
// access control — a non-admin authenticated user's write is silently
// denied by Postgres, same discipline as admin/plans/actions.ts.
export async function updateRecoverPlan(
  planId: string,
  updates: { priceKobo: number; lookbackMonths: number },
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("recover_plans")
    .update({
      price_kobo: updates.priceKobo,
      lookback_months: updates.lookbackMonths,
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId)
    .select("id");

  if (error) return { ok: false, message: "Could not update — please try again." };
  if (!data || data.length === 0) return { ok: false, message: "Could not update — admin access required." };

  revalidatePath("/admin/recover-plans");
  return { ok: true, message: "Tier updated." };
}

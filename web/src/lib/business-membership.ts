import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Resolves the current session's own business, filtering explicitly by
// user_id rather than trusting RLS's default scoping for this query —
// platform_admins can see every business_members row via is_business_member(),
// so an unfiltered select would look like "is a member of every business"
// for the founder's own account.
//
// V1 assumes one business per user, enforced at the write side (both
// onboarding paths refuse if the user already has a membership). The
// `order by created_at` is not decoration: without it, `limit(1)` over
// multiple rows has no defined winner, so a user who somehow ended up with
// two memberships would see their dashboard flip between businesses
// request to request. Ordering makes the fallback deterministic — oldest
// membership wins — instead of arbitrary.
export async function getOwnBusinessId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.business_id ?? null;
}

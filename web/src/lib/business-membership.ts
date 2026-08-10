import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Resolves the current session's own business, filtering explicitly by
// user_id rather than trusting RLS's default scoping for this query —
// platform_admins can see every business_members row via is_business_member(),
// so an unfiltered select would look like "is a member of every business"
// for the founder's own account. V1 assumes one business per user (the
// "owner" model businesses_members.role implies); a user belonging to
// multiple businesses only ever sees the first here — not handled, not
// expected to occur outside test data.
export async function getOwnBusinessId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.business_id ?? null;
}

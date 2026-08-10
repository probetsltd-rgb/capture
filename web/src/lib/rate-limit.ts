import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// DB-backed rate limiting against Supabase's `rate_limit_events` table —
// reuses the Postgres we already have rather than adding a new external
// dependency (e.g. Upstash) for V1's one public endpoint. Not suitable for
// high-volume paths, which is fine: this only guards the intake form.
export async function checkRateLimit(
  key: string,
  { max, windowMinutes }: { max: number; windowMinutes: number },
): Promise<{ allowed: boolean }> {
  const supabase = createServiceRoleClient();
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  const { count, error } = await supabase
    .from("rate_limit_events")
    .select("*", { count: "exact", head: true })
    .eq("key", key)
    .gte("created_at", since);

  if (error) {
    // Fail closed on unexpected errors so a broken rate limiter can't turn
    // into an open public endpoint.
    return { allowed: false };
  }

  if ((count ?? 0) >= max) {
    return { allowed: false };
  }

  await supabase.from("rate_limit_events").insert({ key });
  return { allowed: true };
}

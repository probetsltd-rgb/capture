import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Bypasses RLS entirely. Only ever call this from Server Actions or Route
// Handlers for operations that genuinely need to write on behalf of an
// unauthenticated visitor (e.g. the public intake form creating a
// `businesses` row) — never expose this client or its result set to a
// browser. The `server-only` import makes an accidental client-bundle
// import a build error, not just a runtime leak.
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

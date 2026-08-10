import { createBrowserClient } from "@supabase/ssr";

// Cookie handling is automatic in the browser client — do not pass a
// `cookies` option here (see @supabase/ssr's createBrowserClient docs).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

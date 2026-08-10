import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Create a fresh client per request — never share across requests/renders.
// setAll can silently no-op when called from a Server Component (cookies
// aren't writable there); proxy.ts is what actually persists refreshed
// session cookies back to the browser.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — proxy.ts handles refresh instead.
          }
        },
      },
    },
  );
}

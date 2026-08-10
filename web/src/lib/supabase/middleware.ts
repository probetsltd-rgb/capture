import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Called from proxy.ts on every matched request. This is the ONLY place
// that reliably persists a refreshed session back to the browser — pages
// and Server Components can no-op on cookie writes, so skipping this (or
// getting the getAll/setAll wiring wrong) causes silent, hard-to-debug
// random logouts. See @supabase/ssr's createServerClient JSDoc.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // getClaims() verifies the JWT (locally via JWKS when possible) rather
  // than trusting whatever is sitting in the cookie — do this before any
  // early return so an expired/invalid token actually gets refreshed.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && request.nextUrl.pathname.startsWith("/admin")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

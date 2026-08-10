import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Renamed from `middleware.ts` in Next.js 16 — same mechanism, new name.
// Runs on every matched request to refresh the Supabase session and gate
// /admin. See src/lib/supabase/middleware.ts for the actual logic.
export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

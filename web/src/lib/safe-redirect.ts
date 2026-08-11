// Shared by /login + /signup (which embed `next` in an emailed magic link)
// and /auth/confirm (which feeds it to router.replace after sign-in).
// Deliberately NOT server-only: /auth/confirm is a client component and is
// the actual redirect sink, so it has to validate too rather than trusting
// that the value came from our own form.
//
// A prefix check alone is not sufficient. "/\evil.com" starts with "/" and
// does not start with "//", but browsers normalise the backslash and
// resolve it against the origin as "//evil.com" -> https://evil.com. So
// instead of enumerating bad prefixes, resolve the candidate against a
// throwaway origin and require that the origin survives — anything that
// escapes to another host is rejected by construction.

const FALLBACK = "/admin";
const PROBE_ORIGIN = "https://capture.invalid";

// Control characters (incl. newlines and NUL) have no business in a path and
// are a header/parser-confusion vector. Checked numerically rather than with
// a regex so no raw control bytes end up embedded in this source file.
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function safeNextPath(raw: string | null | undefined, fallback: string = FALLBACK): string {
  if (!raw) return fallback;
  if (hasControlChars(raw)) return fallback;
  if (!raw.startsWith("/")) return fallback;

  let resolved: URL;
  try {
    resolved = new URL(raw, PROBE_ORIGIN);
  } catch {
    return fallback;
  }

  // Escaped the origin ("//host", "/\host", or anything else the URL parser
  // reads as authority-relative).
  if (resolved.origin !== PROBE_ORIGIN) return fallback;

  return resolved.pathname + resolved.search + resolved.hash;
}

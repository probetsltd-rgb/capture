import "server-only";

// The actual bug behind the preview-deployment login failure: a single
// static NEXT_PUBLIC_SITE_URL value can never be correct for preview
// deployments, because each one (`vercel deploy` without --prod) gets a
// unique, unpredictable hostname. There is no value you could type into
// Vercel's env var UI that would be right for "the next preview" — it
// doesn't exist yet at config time.
//
// Vercel sets VERCEL_ENV ('production' | 'preview' | 'development') and
// VERCEL_URL (the CURRENT deployment's own hostname, no protocol)
// automatically on every deployment — no configuration needed, and unlike
// NEXT_PUBLIC_SITE_URL these are correct per-deployment, not per-project.
// See https://vercel.com/docs/environment-variables/system-environment-variables
//
// This only fixes the app side. Supabase's Auth "Redirect URLs" allowlist
// still has to accept whatever preview hostname gets generated — it
// supports wildcards, so a founder-added pattern like
// `https://capture-*-<team-slug>.vercel.app/**` covers every preview for
// this project without needing a per-deploy dashboard edit. That allowlist
// entry can't be added from here (no Supabase management API token
// available in this environment) — it's a one-time manual step.
export function getSiteUrl(): string {
  if (process.env.VERCEL_ENV === "production") {
    return process.env.NEXT_PUBLIC_SITE_URL || `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    // Preview or any other non-production Vercel deployment — VERCEL_URL is
    // this specific deployment's own hostname, so the link always points
    // back at wherever the email was actually sent from.
    return `https://${process.env.VERCEL_URL}`;
  }
  // Local dev: none of the VERCEL_* vars exist.
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

// Shared between the form (page.tsx, for <select> options) and the Server
// Action (actions.ts, for server-side validation + bucket->midpoint
// mapping) so the two can't drift apart.

// PRD §3 candidate verticals.
export const INDUSTRIES = [
  { value: "real_estate", label: "Real estate" },
  { value: "automotive", label: "Automotive" },
  { value: "travel", label: "Travel" },
  { value: "healthcare", label: "Healthcare" },
  { value: "education", label: "Education" },
  { value: "professional_services", label: "Professional services" },
  { value: "hospitality", label: "Hospitality" },
  { value: "events", label: "Events" },
  { value: "construction_interiors", label: "Construction / interiors" },
  { value: "ecommerce", label: "High-value ecommerce" },
  { value: "other", label: "Other" },
] as const;

// Ranges instead of exact figures — lower friction (PRD §8: "keep
// qualification short") and avoids implying false precision. Midpoints
// below are stored in businesses.approx_annual_revenue as a representative
// estimate, not a claim of exact revenue.
export const REVENUE_BUCKETS = [
  { value: "under_10m", label: "Under ₦10m", midpoint: 5_000_000 },
  { value: "10m_50m", label: "₦10m – ₦50m", midpoint: 30_000_000 },
  { value: "50m_200m", label: "₦50m – ₦200m", midpoint: 125_000_000 },
  { value: "200m_plus", label: "₦200m+", midpoint: 300_000_000 },
  { value: "prefer_not_to_say", label: "Prefer not to say", midpoint: null },
] as const;

export const CONVERSATION_VOLUME_BUCKETS = [
  { value: "under_50", label: "Under 50 / month", midpoint: 25 },
  { value: "50_200", label: "50–200 / month", midpoint: 125 },
  { value: "200_500", label: "200–500 / month", midpoint: 350 },
  { value: "500_plus", label: "500+ / month", midpoint: 750 },
] as const;

// Bump this whenever the consent copy on /privacy materially changes, so
// businesses.consent_version tells us which version a business agreed to.
export const CONSENT_VERSION = "draft-2026-08-10";

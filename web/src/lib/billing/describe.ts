import "server-only";

// Founder request 2026-08-21 ("look through admin and think through how it
// can be made more efficient in understanding the business... unable to
// see who is on free tier, subscription to a particular plan etc") — a
// single, reusable way to turn a business's raw plan/trial columns into a
// human-readable status, so the admin Businesses table (a glance-level
// summary) and the per-business billing detail (the full picture) never
// describe the same underlying state two different ways.
export type PlanStatusInput = {
  planStatus: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
};

export function describePlanStatus(
  input: PlanStatusInput,
  planDisplayName: string | null,
  now: Date = new Date(),
): string {
  // Never activated Engage at all (no trial ever started) — distinct from
  // a trial that started and later ended, which is "Trial ended" below.
  if (!input.trialStartedAt) return "No plan";

  if (input.planStatus === "active") {
    const name = planDisplayName ?? "Active";
    if (!input.currentPeriodEnd) return name;
    const renewsAt = new Date(input.currentPeriodEnd);
    // Paystack's own recurring charge should have renewed this before now —
    // a webhook that never arrived, surfaced here rather than silently
    // showing a stale "renews" date in the past.
    if (renewsAt < now) return `${name} · renewal overdue`;
    return `${name} · renews ${renewsAt.toLocaleDateString()}`;
  }

  if (input.planStatus === "past_due") return `${planDisplayName ?? "Plan"} · Past due`;
  if (input.planStatus === "canceled") return `${planDisplayName ?? "Plan"} · Canceled`;

  // plan_status is "trialing" (or null with a trial_started_at, which
  // shouldn't happen post-DEV-22 but is handled the same way defensively).
  if (input.trialEndsAt) {
    const daysLeft = Math.ceil((new Date(input.trialEndsAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (daysLeft > 0) return `Trial · ${daysLeft}d left`;
    return "Trial ended";
  }
  return "Trialing";
}

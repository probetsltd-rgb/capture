-- CAPTURE — Phase 1.7 (CTA capture) + Phase 1.8 (Ops & Analytics) support.
--
-- interested_in_recover/prevent: PRD's CTA into Recover/Prevent should be
-- "captured as interest, even before those products exist in-app" — not
-- mutually exclusive (the PRD's own funnel narrative treats Find->Recover
-- and Find->Prevent as compatible, not alternative, next steps).
--
-- report_viewed_at: a rough, honest proxy for "report engagement" (PRD
-- §44) — first time /report/[token] is rendered. Cannot distinguish a real
-- business view from the founder or an automated test hitting the same
-- token; see OUTSTANDINGS.md.

alter table businesses
  add column interested_in_recover boolean not null default false,
  add column interested_in_prevent boolean not null default false,
  add column interest_captured_at timestamptz,
  add column report_viewed_at timestamptz;

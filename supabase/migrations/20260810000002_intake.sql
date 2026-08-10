-- CAPTURE — Phase 1.3 Public Intake Flow support.
--
-- 1. Consent tracking on businesses: Cross-Cutting Security Workstream
--    (PLANS.md) requires "customer authorisation/consent captured at
--    data-collection points... with a record of consent, not just a UI
--    checkbox." These columns give us a dated, versioned record.
-- 2. rate_limit_events: lightweight DB-backed rate limiting for the public,
--    unauthenticated intake form, reusing the already-provisioned Postgres
--    rather than adding a new external dependency (e.g. Upstash) for V1.

alter table businesses
  add column consent_given_at timestamptz,
  add column consent_version text,
  add column intake_ip inet;

create table rate_limit_events (
  id bigint generated always as identity primary key,
  key text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_key_created_idx on rate_limit_events (key, created_at);

-- Written and read only by server-side code using the service role (which
-- bypasses RLS). RLS is still enabled with no policies as defense in depth,
-- matching the platform_admins pattern: nothing reaches this table through
-- the Data API for anon/authenticated roles.
alter table rate_limit_events enable row level security;

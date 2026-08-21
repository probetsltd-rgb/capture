-- Founder request 2026-08-21: seed candidate knowledge items from a
-- business's own historical Instagram replies (not customer questions —
-- the business's own past answers to real customers) during the existing
-- 30-day historical fetch, so a business isn't starting from a blank
-- knowledge base the moment they connect. This flag makes that a genuine
-- one-time operation per business rather than re-running (and
-- re-suggesting duplicates) on every reconnect/historical-fetch re-run.

alter table businesses
  add column knowledge_base_seeded_at timestamptz;

comment on column businesses.knowledge_base_seeded_at is
  'Set once historical-reply knowledge extraction has run for this business. Null = eligible to run on the next historical fetch. Prevents re-seeding duplicate suggestions on repeated reconnects.';

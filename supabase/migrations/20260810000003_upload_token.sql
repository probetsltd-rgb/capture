-- CAPTURE — Phase 1.4a support: token-based upload access.
--
-- There's no business-facing auth yet (PLANS.md 1.1 deferred business-user
-- auth to "1.3", but 1.3 turned out to be fully public/service-role — no
-- business ever gets a Supabase Auth session). Rather than build a full
-- business signup/login flow just to gate one upload page, each business
-- gets a high-entropy, unguessable token generated at intake time
-- (crypto.randomBytes(32) in submitIntake). The upload route looks up the
-- business by token via the service role (bypassing RLS, same as the
-- intake insert) — token possession is the authorization, not a Postgres
-- role. Not a full session and doesn't expire — see OUTSTANDINGS.md.

alter table businesses
  add column upload_token text unique;

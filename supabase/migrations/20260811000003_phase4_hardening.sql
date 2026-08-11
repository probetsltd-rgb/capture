-- CAPTURE — Phase 4 hardening pass.
--
-- Follow-up to 20260811000002_phase4.sql after a full-build audit. Four
-- real defects, all introduced or amplified by opening the platform to
-- self-service signup:
--
-- 1. Vertical templates seeded knowledge_items that the Prevent response
--    engine treats as business-approved fact. Phase 3's core safety
--    invariant (20260811000000_prevent.sql: "hard-constrained to answer
--    only from this table") assumed every row got there because a human
--    typed it. Template rows are boilerplate *I* wrote in a migration —
--    plausible-sounding opening hours, cancellation policies, delivery
--    terms that no business ever confirmed. A business could sign up,
--    click "Activate Prevent", and have the AI state fabricated
--    commitments to real customers. approved_at makes "approved" explicit
--    rather than implied by row existence.
-- 2. claimBusiness()'s single-claim check was a read followed by an
--    unrelated insert — two concurrent claims on the same audit could both
--    pass. business_members' unique constraint is (business_id, user_id),
--    which does not prevent two *different* users both becoming owner.
-- 3. Self-serve signup wrote `businesses` and `business_members` as two
--    separate statements. A failure between them left an orphan tenant
--    reachable by nobody and cleaned up by nothing.
-- 4. max_recover_followups had no upper bound, so a business could set it
--    to 500 via the settings form and defeat PRD §12's anti-spam cap
--    entirely. Clamped in application code too (recover/rules.ts) —
--    this is the defense-in-depth layer, not the only one.

-- ---------------------------------------------------------------------------
-- 1. Explicit knowledge approval
-- ---------------------------------------------------------------------------

alter table knowledge_items
  add column approved_at timestamptz;

comment on column knowledge_items.approved_at is
  'Null = pending human review; the Prevent response engine must never see these rows (see web/src/lib/prevent/process.ts). Set when a human explicitly authors or approves the item. Vertical-template-seeded rows deliberately start null.';

-- Every existing row predates templates, so each one was hand-entered by a
-- human through the knowledge admin form — genuinely approved. (Verified
-- zero rows at time of writing, so this is a no-op safety net rather than
-- an assumption about unknown data.)
update knowledge_items set approved_at = created_at where approved_at is null;

create index knowledge_items_approved_idx on knowledge_items (business_id, approved_at);

-- ---------------------------------------------------------------------------
-- 2. One owner per business
-- ---------------------------------------------------------------------------

-- Makes the claim race unwinnable rather than merely unlikely: the second
-- concurrent claim now fails on a constraint instead of silently creating a
-- co-owner. Deliberately scoped to role='owner' so adding 'admin'/'staff'
-- members later (already permitted by business_members.role) stays possible.
create unique index business_members_one_owner_per_business
  on business_members (business_id)
  where role = 'owner';

-- ---------------------------------------------------------------------------
-- 3. Transactional business + owner creation
-- ---------------------------------------------------------------------------

-- business_members has no INSERT policy by design — self-granting tenant
-- membership must never be something an RLS predicate can be satisfied
-- into — so signup runs as service_role. This wraps both writes in one
-- statement so they cannot half-apply.
--
-- SECURITY DEFINER + a pinned search_path, and execute is revoked from
-- public/anon/authenticated: only the service role (which already bypasses
-- RLS) can call it, so this adds no new reachable surface via the Data API.
-- The caller is responsible for verifying the session; p_user_id must come
-- from a server-verified JWT, never from client input.
create function public.create_business_with_owner(
  p_user_id uuid,
  p_name text,
  p_industry text,
  p_contact_email text,
  p_avg_transaction_value numeric,
  p_upload_token text,
  p_consent_version text,
  p_intake_ip inet
) returns uuid as $$
declare
  v_business_id uuid;
begin
  insert into businesses (
    name, industry, contact_email, avg_transaction_value, upload_token,
    signup_source, onboarded_at, consent_given_at, consent_version, intake_ip
  ) values (
    p_name, p_industry, p_contact_email, p_avg_transaction_value, p_upload_token,
    'self_serve_signup', now(), now(), p_consent_version, p_intake_ip
  )
  returning id into v_business_id;

  insert into business_members (business_id, user_id, role)
  values (v_business_id, p_user_id, 'owner');

  return v_business_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function public.create_business_with_owner(uuid, text, text, text, numeric, text, text, inet) from public;
revoke execute on function public.create_business_with_owner(uuid, text, text, text, numeric, text, text, inet) from anon;
revoke execute on function public.create_business_with_owner(uuid, text, text, text, numeric, text, text, inet) from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Bound the configurable follow-up caps
-- ---------------------------------------------------------------------------

-- PRD §12's "one further follow-up where appropriate → Stop" is a
-- trust/anti-spam guarantee made to the *customer being messaged*, not a
-- business preference. A business may tighten it; it must not be able to
-- loosen it past the platform maximum of 2 total contacts.
alter table businesses
  drop constraint businesses_max_recover_followups_check,
  add constraint businesses_max_recover_followups_check
    check (max_recover_followups is null or (max_recover_followups >= 0 and max_recover_followups <= 2)),
  drop constraint businesses_max_ai_followups_check,
  add constraint businesses_max_ai_followups_check
    check (max_ai_followups is null or (max_ai_followups >= 0 and max_ai_followups <= 2));

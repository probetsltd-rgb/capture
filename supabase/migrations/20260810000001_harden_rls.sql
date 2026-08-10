-- CAPTURE — RLS hardening pass.
--
-- Follow-up to 20260810000000_init.sql after reviewing Supabase's current
-- security guidance (supabase:supabase skill). Three real gaps in the
-- shipped migration:
--
-- 1. is_business_member()/is_platform_admin() lived in `public`, which
--    Supabase's Data API (PostgREST) exposes by default — any SECURITY
--    DEFINER function in an exposed schema is directly callable as an RPC
--    endpoint by anon/authenticated clients. Moved to a new `internal`
--    schema, which is never in PostgREST's exposed-schema list, so it's
--    unreachable via the Data API regardless of grants.
-- 2. Policies didn't specify `TO authenticated`, so they were evaluated
--    for every role including anon. Functionally the row predicate still
--    denied anon (auth.uid() is null), but explicit role scoping is the
--    documented pattern and avoids relying on that being true forever.
-- 3. businesses_update had a USING clause but no WITH CHECK, which is the
--    documented BOLA/IDOR trap for UPDATE policies.

create schema internal;

-- Drop every policy that references the old public helpers before dropping
-- the helpers themselves (Postgres won't drop a function with dependents).

drop policy if exists businesses_select on businesses;
drop policy if exists businesses_update on businesses;
drop policy if exists business_members_select on business_members;
drop policy if exists customers_all on customers;
drop policy if exists conversations_all on conversations;
drop policy if exists messages_all on messages;
drop policy if exists opportunities_all on opportunities;
drop policy if exists automations_all on automations;
drop policy if exists audit_log_select on audit_log;
drop policy if exists audit_log_insert on audit_log;

drop function if exists is_business_member(uuid);
drop function if exists is_platform_admin();

create function internal.is_business_member(target_business_id uuid) returns boolean as $$
  select exists (
    select 1 from business_members
    where business_id = target_business_id and user_id = auth.uid()
  ) or exists (
    select 1 from platform_admins where user_id = auth.uid()
  );
$$ language sql security definer stable set search_path = public;

create function internal.is_platform_admin() returns boolean as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$ language sql security definer stable set search_path = public;

revoke execute on function internal.is_business_member(uuid) from public;
revoke execute on function internal.is_platform_admin() from public;
grant execute on function internal.is_business_member(uuid) to authenticated;
grant execute on function internal.is_platform_admin() to authenticated;

-- Recreate every policy against the new internal.* helpers, this time
-- scoped explicitly `to authenticated`.

create policy businesses_select on businesses
  for select to authenticated
  using (internal.is_business_member(id));
create policy businesses_update on businesses
  for update to authenticated
  using (internal.is_business_member(id))
  with check (internal.is_business_member(id));

create policy business_members_select on business_members
  for select to authenticated
  using (internal.is_business_member(business_id));

create policy customers_all on customers
  for all to authenticated
  using (internal.is_business_member(business_id))
  with check (internal.is_business_member(business_id));

create policy conversations_all on conversations
  for all to authenticated
  using (internal.is_business_member(business_id))
  with check (internal.is_business_member(business_id));

create policy messages_all on messages
  for all to authenticated
  using (internal.is_business_member(business_id))
  with check (internal.is_business_member(business_id));

create policy opportunities_all on opportunities
  for all to authenticated
  using (internal.is_business_member(business_id))
  with check (internal.is_business_member(business_id));

create policy automations_all on automations
  for all to authenticated
  using (internal.is_business_member(business_id))
  with check (internal.is_business_member(business_id));

create policy audit_log_select on audit_log
  for select to authenticated
  using (internal.is_business_member(business_id));
create policy audit_log_insert on audit_log
  for insert to authenticated
  with check (internal.is_business_member(business_id) and actor_user_id = auth.uid());

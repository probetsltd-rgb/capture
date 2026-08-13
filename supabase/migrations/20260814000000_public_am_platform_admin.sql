-- internal.is_platform_admin() is deliberately unreachable via the Data API
-- (moved to the internal schema in 20260810000001_harden_rls.sql, which is
-- never in PostgREST's exposed-schema list). That was correct for
-- is_business_member(target_business_id) — a parameterised function taking
-- attacker-controllable input would let anyone probe arbitrary business
-- IDs. This is different: it takes no parameters and only ever answers
-- "is the CALLING user (auth.uid()) a platform admin", so there is nothing
-- to probe. Needed because /dashboard was funnelling the founder's own
-- platform_admin account (which legitimately owns no business) into
-- "set up your business" onboarding instead of /admin, since there was no
-- safe way for a Server Component to ask this question at all before now.
create function public.am_platform_admin() returns boolean as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$ language sql security definer stable set search_path = public;

revoke execute on function public.am_platform_admin() from public;
revoke execute on function public.am_platform_admin() from anon;
grant execute on function public.am_platform_admin() to authenticated;

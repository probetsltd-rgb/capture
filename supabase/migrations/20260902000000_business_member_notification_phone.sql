-- A team member's own notification phone number (PLANS.md WhatsApp-relay
-- escalation groundwork) — self-serve, not admin-managed, since it's
-- personal contact info for that member alone, not a business-wide
-- setting. Stored on business_members rather than a new table since it's
-- a 1:1 attribute of one member's membership row, not something with its
-- own lifecycle.
--
-- business_members has no authenticated UPDATE policy today (only
-- business_members_select from 20260810000001_harden_rls.sql) — every
-- write to it so far has gone through the service role. This is the
-- first self-serve write a member needs to make to their own row, so it
-- gets its own narrowly-scoped policy rather than reusing service-role
-- (which would need an explicit ownership check in application code
-- instead of the database enforcing it directly) or widening
-- business_members_select's intent. Scoped to the caller's own row only
-- (user_id = auth.uid()) — a member can never edit another member's row,
-- even within the same business.
alter table business_members add column whatsapp_number text;

create policy business_members_update_self on business_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

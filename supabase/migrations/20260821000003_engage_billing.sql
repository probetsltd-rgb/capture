-- CAPTURE — Engage Paystack billing + trial-to-paid transition.
--
-- Founder request 2026-08-21: real payment collection for Engage
-- ("this build is going to earn money for the value its delivering and
-- payment should be wired into every product"), overruling the original
-- V1 no-payment-processing scope note (PLANS.md Phase 5.6). Two tiers
-- (Basic/Standard), pay-to-continue at trial end (no card collected
-- upfront). All tier numbers live in `plans`, not hardcoded in
-- application code — explicit founder instruction, so pricing/limits can
-- be tuned from /admin without a redeploy.

create table plans (
  id text primary key,
  display_name text not null,
  price_kobo integer not null,
  message_limit integer, -- null = unlimited
  escalation_notification_limit integer not null,
  has_analytics boolean not null default false,
  paystack_plan_code text,
  updated_at timestamptz not null default now()
);

comment on table plans is 'Admin-editable Engage tier definitions. Every number here (price, limits) is tunable from /admin/plans without a code change or redeploy — deliberate, per founder instruction not to hardcode billing numbers.';
comment on column plans.escalation_notification_limit is 'Caps how many escalations per billing period trigger an active notification (email/WhatsApp). Never caps the escalation itself — an unsafe/unclear conversation always escalates and always shows in the dashboard regardless of this limit. See lib/prevent/process.ts.';

insert into plans (id, display_name, price_kobo, message_limit, escalation_notification_limit, has_analytics) values
  ('basic', 'Basic', 2900000, 500, 1, false),
  ('standard', 'Standard', 5900000, 2000, 3, true);

-- Simple key/value store for global tunables that don't warrant their own
-- column/table (starting with trial_days) — same "editable, not
-- hardcoded" principle as `plans`.
create table app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value) values ('trial_days', '7');

alter table businesses
  add column trial_started_at timestamptz,
  add column trial_ends_at timestamptz,
  add column plan_id text references plans(id),
  add column plan_status text check (plan_status in ('trialing', 'active', 'past_due', 'canceled')),
  add column paystack_customer_code text,
  add column paystack_subscription_code text,
  add column current_period_end timestamptz;

comment on column businesses.plan_status is 'null until Engage is activated (trial_started_at set). Source of truth for access is the payments table via webhook events, not this column alone — this is a derived convenience field kept in sync by the Paystack webhook handler.';

-- Append-only audit trail: one row per real Paystack event received via
-- webhook. This, not businesses.plan_status, is the record of "did we
-- actually get paid" — plan_status is a derived convenience field the
-- webhook keeps in sync, this table is never overwritten.
create table payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  paystack_reference text not null unique,
  amount_kobo integer not null,
  status text not null,
  plan_id text references plans(id),
  created_at timestamptz not null default now()
);

create index payments_business_id_idx on payments (business_id);

-- One row per notification actually *sent* (not per escalation, which
-- always happens regardless of billing) — counted against
-- plans.escalation_notification_limit to gate future sends.
create table escalation_notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  sent_at timestamptz not null default now()
);

create index escalation_notifications_business_id_idx on escalation_notifications (business_id, sent_at);

alter table plans enable row level security;
alter table app_settings enable row level security;
alter table payments enable row level security;
alter table escalation_notifications enable row level security;

-- plans/app_settings are shared reference data, readable by any
-- authenticated user (needed to render live pricing/limits on the
-- dashboard paywall) — same pattern as vertical_templates. Writes are
-- platform-admin only, via internal.is_platform_admin() (the hardened
-- helper introduced in 20260810000001_harden_rls.sql).
create policy plans_select on plans for select to authenticated using (true);
create policy plans_write on plans for all to authenticated
  using (internal.is_platform_admin()) with check (internal.is_platform_admin());
create policy app_settings_select on app_settings for select to authenticated using (true);
create policy app_settings_write on app_settings for all to authenticated
  using (internal.is_platform_admin()) with check (internal.is_platform_admin());

create policy payments_select on payments
  for select to authenticated using (internal.is_business_member(business_id));
create policy escalation_notifications_select on escalation_notifications
  for select to authenticated using (internal.is_business_member(business_id));

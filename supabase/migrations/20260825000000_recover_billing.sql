-- CAPTURE — Recover one-time pricing.
--
-- Founder request 2026-08-25: real payment for Recover, admin-editable, via
-- Paystack — but one-time per purchase, not a recurring subscription like
-- Engage. The founder's own reasoning: "the one way to really know if the
-- pricing works is to see who actually pays for it... because this isn't
-- recurring payment, pricing can be admin editable and that drives the
-- paystack end of things." Distinguishing axis is the lookback window
-- (how much conversation history Recover analyses), not feature-gating —
-- also new: before this, Recover's code had no lookback concept anywhere
-- (confirmed by search of src/lib/recover/ during this session).
--
-- Deliberately a separate table from `plans`, not overloaded columns:
-- plans.message_limit/escalation_notification_limit/has_analytics are
-- Engage-recurring concepts that don't apply here, and payments.plan_id has
-- a hard FK to plans(id) so a Recover purchase can't reuse that row shape.
-- recover_purchases is self-sufficient instead (own reference/amount/
-- status) — `payments` stays exclusively Engage's subscription ledger.

create table recover_plans (
  id text primary key,
  display_name text not null,
  price_kobo integer not null,
  lookback_months integer not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

comment on table recover_plans is 'Admin-editable Recover tier definitions (one-time charge, not a subscription). Editing price_kobo here takes effect on the very next checkout — no Paystack-side Plan object to keep in sync, since a one-time charge reads this table fresh at checkout time.';

-- Founder-proposed starting point, explicitly described as a hypothesis to
-- test with real customers, not a final price — admin-editable from here.
insert into recover_plans (id, display_name, price_kobo, lookback_months, sort_order) values
  ('recover_entry', 'Entry', 2400000, 6, 0),
  ('recover_extended', 'Extended', 4900000, 24, 1);

-- Append-only: one row per real Paystack charge.success for a Recover
-- purchase (idempotent on paystack_reference, same as `payments`).
-- lookback_months is denormalized at purchase time — a later admin edit to
-- recover_plans.lookback_months must never retroactively change what a
-- customer already paid for.
create table recover_purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  recover_plan_id text not null references recover_plans(id),
  paystack_reference text not null unique,
  amount_kobo integer not null,
  lookback_months integer not null,
  status text not null default 'success',
  purchased_at timestamptz not null default now()
);

comment on table recover_purchases is 'Source of truth for Recover access: a business has access iff it has at least one row here. The lookback window to apply is max(lookback_months) across a business''s rows, so a later upgrade purchase extends the window without needing a mutable state column on businesses.';

create index recover_purchases_business_id_idx on recover_purchases (business_id);

alter table recover_plans enable row level security;
alter table recover_purchases enable row level security;

-- Same pattern as plans/payments in 20260821000003_engage_billing.sql:
-- tier definitions are shared reference data, readable by any authenticated
-- user (needed to render the live paywall), writes are platform-admin only.
create policy recover_plans_select on recover_plans for select to authenticated using (true);
create policy recover_plans_write on recover_plans for all to authenticated
  using (internal.is_platform_admin()) with check (internal.is_platform_admin());

create policy recover_purchases_select on recover_purchases
  for select to authenticated using (internal.is_business_member(business_id));
-- No authenticated insert/update policy, deliberately — only the
-- service-role Paystack webhook handler ever writes a row here, same as
-- `payments`.

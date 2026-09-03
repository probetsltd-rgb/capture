-- Founder decision 2026-09-03: add an annual billing option alongside the
-- existing monthly one — not quarterly, deliberately (see the founder's
-- own reasoning: annual is the option that actually reduces Nigerian
-- recurring-card-debit failures, quarterly doesn't meaningfully help
-- either that or the discount story). Exactly 2 duration options, per
-- explicit instruction not to exceed that.
--
-- `tier` groups the existing 'basic'/'standard' monthly rows together
-- with their new annual counterparts for display purposes (one pricing
-- card per tier, monthly/annual as two buttons within it) without
-- disturbing `plans.id` as the primary key every existing FK
-- (businesses.plan_id, payments.plan_id) and call site (updatePlan,
-- startSubscription) already keys off. Existing 'basic'/'standard' rows
-- keep their ids unchanged — verified zero real subscribers and zero
-- payments rows exist yet (both empty), so this was genuinely free to
-- restructure however made sense, but there was no reason to rename
-- working ids when tier does the grouping job on its own.
alter table plans add column tier text;
update plans set tier = id;
alter table plans alter column tier set not null;

alter table plans add column billing_interval text not null default 'monthly'
  check (billing_interval in ('monthly', 'annual'));

create unique index plans_tier_interval_idx on plans (tier, billing_interval);

-- 10x the monthly price ("2 months free" when paid annually) — the
-- standard, easily-explained SaaS annual-discount framing. paystack_plan_code
-- filled in separately once the matching Paystack Plan objects exist
-- (created via the API, not the dashboard, so the exact interval/amount
-- is verifiable — see the founder-facing migration log).
insert into plans (id, display_name, tier, billing_interval, price_kobo, message_limit, escalation_notification_limit, has_analytics) values
  ('basic_annual', 'Basic', 'basic', 'annual', 29000000, 500, 1, false),
  ('standard_annual', 'Standard', 'standard', 'annual', 59000000, 2000, 3, true);

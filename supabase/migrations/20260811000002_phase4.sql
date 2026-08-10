-- CAPTURE — Phase 4 (Productisation) support.
--
-- Closes a gap every prior phase's comments flagged explicitly: "no business
-- ever gets a Supabase Auth session" (20260810000003) / "Founder/admin auth
-- only for now... business-user signup is a [later] concern" (login/actions.ts).
-- `business_members` + RLS have supported real self-service since Phase 1.1
-- (AD-4) but nothing ever wrote a business_members row for anyone but the
-- founder. This migration only adds the *data* self-service onboarding
-- needs — see web/src/app/onboarding for the flow that populates it.
--
-- Scope note (OUTSTANDINGS.md DEV-4): "billing/plan limits" here means
-- tracking which products a business has configured/activated, NOT payment
-- processing — that's an explicit V1 non-goal (PLANS.md pinned reminder).
-- recover_activated_at/prevent_activated_at are a business self-serving the
-- "Approve/Activate" step of PRD §27-28's deployment workflow, not a paywall.

alter table businesses
  add column signup_source text not null default 'find_intake'
    check (signup_source in ('find_intake', 'self_serve_signup')),
  add column onboarded_at timestamptz,
  -- null = use the hardcoded default in recover/rules.ts / prevent/timers.ts.
  -- Business-configurable "Configure Rules" step, self-serve equivalent of
  -- what previously required a founder SQL edit.
  add column max_ai_followups integer check (max_ai_followups is null or max_ai_followups >= 0),
  add column max_recover_followups integer check (max_recover_followups is null or max_recover_followups >= 0),
  add column escalation_keywords jsonb not null default '[]'::jsonb,
  add column recover_activated_at timestamptz,
  add column prevent_activated_at timestamptz;

comment on column businesses.signup_source is 'How this business record was created — a Find intake audit, or a fresh self-serve signup with no prior Find audit.';
comment on column businesses.escalation_keywords is 'Business-supplied additions to the deterministic human-request trigger phrases in prevent/deterministic-triggers.ts. Array of plain strings, substring-matched case-insensitively.';

-- Reusable per-vertical starter configuration (PRD Phase 4 "reusable
-- per-vertical configuration templates"). Not tenant data — platform-level
-- product config, keyed by the same `vertical` values as find/constants.ts's
-- INDUSTRIES so a business's existing `industry` value (collected at Find
-- intake, or picked during self-serve onboarding) can look one up directly
-- without a second, separate "vertical" concept to keep in sync.
create table vertical_templates (
  id uuid primary key default gen_random_uuid(),
  vertical text unique not null,
  display_name text not null,
  -- array of {category, question, content} — same shape as knowledge_items'
  -- insertable columns, applied verbatim by onboarding/actions.ts.
  knowledge_base_items jsonb not null default '[]'::jsonb,
  default_escalation_keywords jsonb not null default '[]'::jsonb,
  default_max_ai_followups integer not null default 2,
  default_max_recover_followups integer not null default 2,
  created_at timestamptz not null default now()
);

alter table vertical_templates enable row level security;

-- Readable by any authenticated user (needed at onboarding, before a
-- business_members row exists yet) — this is shared product config, not
-- tenant data, so it doesn't go through is_business_member. No insert/
-- update/delete policy: templates are seeded/maintained via migration only,
-- not a self-service UI in V1.
create policy vertical_templates_select on vertical_templates
  for select to authenticated using (true);

insert into vertical_templates (vertical, display_name, knowledge_base_items, default_escalation_keywords, default_max_ai_followups, default_max_recover_followups) values
(
  'real_estate',
  'Real estate',
  '[
    {"category": "faq", "question": "What areas do you cover?", "content": "We handle listings and enquiries across Lagos, with a focus on Lekki, Ikoyi, and Victoria Island."},
    {"category": "booking", "question": "How do I book a viewing?", "content": "Viewings are booked by appointment — share your preferred date/time and the listing you are interested in, and a human will confirm availability."},
    {"category": "policy", "question": "Do you require an agency fee?", "content": "Yes, standard agency/agent fees apply per Lagos market convention; exact percentage is confirmed per listing by a human agent."}
  ]'::jsonb,
  '["fraud", "scam", "lawyer", "litigation"]'::jsonb,
  2, 2
),
(
  'automotive',
  'Automotive',
  '[
    {"category": "faq", "question": "Do you offer test drives?", "content": "Yes — test drives can be booked for any vehicle currently in stock, subject to availability."},
    {"category": "policy", "question": "Do you accept trade-ins?", "content": "Trade-ins are considered case by case; a human needs to inspect the vehicle before any valuation is given."},
    {"category": "delivery", "question": "Can you deliver outside Lagos?", "content": "Inter-state delivery is available for an additional fee, arranged directly with our logistics team once a purchase is confirmed."}
  ]'::jsonb,
  '["accident", "warranty claim", "refund"]'::jsonb,
  2, 2
),
(
  'hospitality',
  'Hospitality',
  '[
    {"category": "hours", "question": "What are your opening hours?", "content": "We are open daily from 10am to 10pm, including public holidays."},
    {"category": "booking", "question": "How do I make a reservation?", "content": "Reservations can be made by sharing your preferred date, time, and party size — a human will confirm availability."},
    {"category": "policy", "question": "What is your cancellation policy?", "content": "Reservations can be cancelled free of charge up to 2 hours before the booked time."}
  ]'::jsonb,
  '["allergy", "food poisoning", "event booking"]'::jsonb,
  2, 2
);

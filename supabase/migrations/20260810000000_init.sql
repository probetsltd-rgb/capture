-- CAPTURE — initial schema (Phase 1.1 Foundations + 1.2 Security Baseline)
--
-- Implements the V1 data model (Capture_PRD.md §31) plus the multi-tenant
-- access-control layer required by PLANS.md's Cross-Cutting Security &
-- Compliance Workstream: every tenant-scoped table carries business_id and
-- has RLS enabled, an append-only audit_log records access, and public
-- writes (Find's unauthenticated intake form) go through a server-only
-- service-role route rather than direct client inserts — so no anon INSERT
-- policy is granted on businesses.
--
-- is_simulated flags rows seeded by scripts/seed-simulated-data.sql
-- (OUTSTANDINGS.md DEV-1) so simulated fixtures can never be mistaken for
-- real tenant data in reporting or exports.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tenancy root
-- ---------------------------------------------------------------------------

create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  website text,
  instagram_handle text,
  contact_email text,
  contact_phone text,
  approx_annual_revenue numeric,
  approx_monthly_conversations integer,
  avg_transaction_value numeric,
  config jsonb not null default '{}'::jsonb, -- channels/configuration, PRD §31
  is_simulated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table businesses is 'Tenant root. One row per Capture customer business (PRD §31 Business).';
comment on column businesses.is_simulated is 'True for fixture data from scripts/seed-simulated-data.sql — see OUTSTANDINGS.md DEV-1. Never true for real tenant data.';

-- Maps auth.users to the business(es) they belong to.
create table business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

-- Internal Capture staff (founder/team) who can access all tenants for ops
-- (Phase 1.8 admin view) and support. Membership managed manually via SQL,
-- not self-service.
create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Core domain tables (PRD §31)
-- ---------------------------------------------------------------------------

create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text,
  phone text,
  handle text, -- e.g. Instagram handle
  source text not null default 'manual_export' check (source in ('manual_export', 'whatsapp_api', 'instagram_api', 'manual_entry')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index customers_business_id_idx on customers (business_id);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'instagram', 'other')),
  source text not null default 'manual_export' check (source in ('manual_export', 'whatsapp_api', 'instagram_api')),
  first_message_at timestamptz,
  last_message_at timestamptz,
  message_count integer not null default 0,

  -- Classification taxonomy — PRD §9, exact values, mirrors
  -- phase0/conversation_log_template.csv so simulated/manual and future
  -- AI-classified rows are directly comparable.
  conversation_type text check (conversation_type in ('sales_enquiry', 'existing_customer', 'support', 'complaint', 'general', 'spam_irrelevant', 'unknown')),
  intent text check (intent in ('high', 'medium', 'low', 'none')),
  status text check (status in ('converted', 'likely_converted', 'abandoned', 'no_response', 'unresolved', 'unclear')),
  leakage_type text check (leakage_type in ('no_response', 'delayed_response', 'abandoned_high_intent', 'quote_not_followed_up', 'reactivatable', 'other', 'none')),

  -- Conversation state machine — PRD §32. NEW/AI_HANDLING apply from Phase 3
  -- (Prevent); Find/Recover conversations typically sit in NEW or CLOSED.
  state text not null default 'new' check (state in ('new', 'ai_handling', 'human_required', 'human_handling', 'follow_up', 'closed')),

  is_simulated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_business_id_idx on conversations (business_id);
create index conversations_customer_id_idx on conversations (customer_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade, -- denormalized for RLS
  sender_type text not null check (sender_type in ('customer', 'business', 'ai', 'system')),
  body text,
  external_message_id text, -- WhatsApp API message id, for idempotent webhook ingestion (Phase 1.4b)
  sent_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on messages (conversation_id);
create index messages_business_id_idx on messages (business_id);
create unique index messages_external_message_id_idx on messages (business_id, external_message_id) where external_message_id is not null;

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  source_conversation_id uuid references conversations(id) on delete set null,
  type text not null check (type in ('unanswered_enquiry', 'cold_high_intent', 'previous_customer_reactivation', 'other')),
  intent text check (intent in ('high', 'medium', 'low', 'none')),

  -- PRD §14: deliberately simple attribution — Won/Lost/Not sure, no
  -- sophisticated attribution modeling in V1.
  status text not null default 'identified' check (status in ('identified', 'contacted', 'responded', 'won', 'lost', 'not_sure')),

  estimated_value numeric,
  actual_revenue numeric,
  is_simulated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index opportunities_business_id_idx on opportunities (business_id);
create index opportunities_customer_id_idx on opportunities (customer_id);

create table automations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  trigger text not null,
  action text not null,

  -- PRD §12/§24: one-follow-up-max anti-spam guardrail is enforced in
  -- application logic against automations.status/history, not just here —
  -- this column tracks individual send status.
  status text not null default 'pending' check (status in ('pending', 'sent', 'responded', 'stopped', 'completed', 'failed')),

  scheduled_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create index automations_business_id_idx on automations (business_id);
create index automations_opportunity_id_idx on automations (opportunity_id);

-- ---------------------------------------------------------------------------
-- Audit log — Cross-Cutting Security Workstream (PLANS.md): append-only,
-- no update/delete policies are ever granted on this table.
-- ---------------------------------------------------------------------------

create table audit_log (
  id bigint generated always as identity primary key,
  business_id uuid references businesses(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_business_id_idx on audit_log (business_id);
create index audit_log_created_at_idx on audit_log (created_at);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger businesses_set_updated_at before update on businesses
  for each row execute function set_updated_at();
create trigger conversations_set_updated_at before update on conversations
  for each row execute function set_updated_at();
create trigger opportunities_set_updated_at before update on opportunities
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table businesses enable row level security;
alter table business_members enable row level security;
alter table platform_admins enable row level security;
alter table customers enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table opportunities enable row level security;
alter table automations enable row level security;
alter table audit_log enable row level security;

-- Helper: is the current auth user a member of the given business, or a
-- platform admin? security definer so it can read business_members /
-- platform_admins regardless of the caller's own row-level access to them.
create function is_business_member(target_business_id uuid) returns boolean as $$
  select exists (
    select 1 from business_members
    where business_id = target_business_id and user_id = auth.uid()
  ) or exists (
    select 1 from platform_admins where user_id = auth.uid()
  );
$$ language sql security definer stable;

create function is_platform_admin() returns boolean as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$ language sql security definer stable;

-- businesses: members/admins can see and update their own business. No
-- public/anon SELECT or INSERT — the Find intake form writes via a
-- server-only service-role route handler, not client-side RLS-governed
-- inserts, so anonymous visitors cannot enumerate or read other businesses.
create policy businesses_select on businesses
  for select using (is_business_member(id));
create policy businesses_update on businesses
  for update using (is_business_member(id));

create policy business_members_select on business_members
  for select using (is_business_member(business_id));

-- customers / conversations / messages / opportunities / automations:
-- standard tenant-scoped CRUD for members+admins, denied entirely otherwise
-- (RLS defaults to deny when enabled with no matching policy).
create policy customers_all on customers
  for all using (is_business_member(business_id)) with check (is_business_member(business_id));

create policy conversations_all on conversations
  for all using (is_business_member(business_id)) with check (is_business_member(business_id));

create policy messages_all on messages
  for all using (is_business_member(business_id)) with check (is_business_member(business_id));

create policy opportunities_all on opportunities
  for all using (is_business_member(business_id)) with check (is_business_member(business_id));

create policy automations_all on automations
  for all using (is_business_member(business_id)) with check (is_business_member(business_id));

-- audit_log: append-only. Members/admins can read their own business's
-- log (PRD §33 "access audit where feasible"); inserts are restricted to
-- rows the actor attributes to themselves within a business they belong
-- to. System/AI-generated entries with no human actor are written via the
-- service role, which bypasses RLS. No update or delete policy exists for
-- any role — the table is immutable from the application's perspective.
create policy audit_log_select on audit_log
  for select using (is_business_member(business_id));
create policy audit_log_insert on audit_log
  for insert with check (is_business_member(business_id) and actor_user_id = auth.uid());

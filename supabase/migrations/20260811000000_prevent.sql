-- CAPTURE — Phase 3 (Prevent) support.
--
-- knowledge_items: approved knowledge a business provides (PRD §17B). The
-- response engine is hard-constrained to answer only from this table — see
-- web/src/lib/prevent/engine.ts. This is the single most safety-critical
-- piece of Phase 3 (adversarial-tested, see TESTS.md).
--
-- conversations gains escalation/kill-switch/timer/follow-up tracking.
-- human_taken_at is the actual kill switch: the response engine checks it
-- (and conversations.state) before ever generating a reply, so "Take
-- Conversation" stopping AI is enforced at the data layer, not just hidden
-- in a UI that a race condition could bypass.

create table knowledge_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  category text not null check (category in ('product', 'price', 'faq', 'hours', 'location', 'policy', 'delivery', 'booking', 'other')),
  question text,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_items_business_id_idx on knowledge_items (business_id);

create trigger knowledge_items_set_updated_at before update on knowledge_items
  for each row execute function set_updated_at();

alter table knowledge_items enable row level security;
create policy knowledge_items_all on knowledge_items
  for all to authenticated
  using (internal.is_business_member(business_id))
  with check (internal.is_business_member(business_id));

alter table conversations
  add column escalation_reason text,
  add column escalated_at timestamptz,
  add column human_taken_at timestamptz,
  add column assigned_to text,
  add column t10_reminder_sent_at timestamptz,
  add column t30_escalated_at timestamptz,
  add column ai_followup_count integer not null default 0;

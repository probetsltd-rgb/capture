-- Founder request 2026-08-26: strengthen the 30-day-history knowledge base
-- seed (web/src/lib/channels/instagram.ts's seedKnowledgeFromHistory) with
-- 3-5 AI-inferred gap questions per business — things the AI noticed were
-- never stated (or stated incompletely) in the business's own past replies
-- but would matter to a real customer (e.g. delivery mentioned with no fee,
-- returns never mentioned at all).
--
-- Kept as its own table, not folded into knowledge_items: a "please answer
-- this" card and a "please approve this AI guess" card are different
-- interactions (one needs a text answer, the other a yes/no), and
-- overloading knowledge_items' existing pending/approved semantics for both
-- would blur that distinction in EngageKnowledgeView.tsx.
create table knowledge_gap_questions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  category text not null check (category in ('product', 'faq', 'hours', 'location', 'policy', 'delivery', 'booking', 'other')),
  question text not null,
  status text not null default 'pending' check (status in ('pending', 'answered', 'dismissed')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  resulting_knowledge_item_id uuid references knowledge_items(id) on delete set null
);

create index knowledge_gap_questions_business_id_idx on knowledge_gap_questions (business_id, status);

-- Same access shape as knowledge_items (20260811000000_prevent.sql): any
-- business member can read/answer/dismiss. Rows are only ever inserted by
-- the service-role seed job, not by an authenticated user directly, so
-- authenticated INSERT is intentionally not granted here (UPDATE covers
-- answering/dismissing an existing row).
alter table knowledge_gap_questions enable row level security;
create policy knowledge_gap_questions_select on knowledge_gap_questions
  for select to authenticated
  using (internal.is_business_member(business_id));
create policy knowledge_gap_questions_update on knowledge_gap_questions
  for update to authenticated
  using (internal.is_business_member(business_id))
  with check (internal.is_business_member(business_id));

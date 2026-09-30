-- Campaign keyword triggers (scoped in chat 2026-09-30): a self-serve
-- feature for any business, not just Capture's own — a business running an
-- ad campaign ("DM us the word CAPTURE") can register that keyword so the
-- customer's first message is recognized as fresh interest, not a
-- knowledge gap the engine silently escalates on with no reply (Engage's
-- normal tier-D behavior for an ungrounded one-word message — see
-- lib/prevent/engine.ts). Distinct from businesses.escalation_keywords,
-- which matches a substring anywhere in a message and means the opposite
-- ("hand this off immediately, no auto-reply") — campaign keywords need
-- their own richer shape (a name for reporting, an optional qualifying
-- question) that a plain text[] can't carry, and strict near-exact
-- matching (see detectCampaignKeyword) rather than substring matching, so
-- a customer asking "can you capture that in a photo" never misfires one.
create table campaign_keywords (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  keyword text not null,
  campaign_name text not null,
  qualifying_prompt text,
  created_at timestamptz not null default now()
);

create unique index campaign_keywords_business_keyword_idx on campaign_keywords (business_id, lower(keyword));
create index campaign_keywords_business_id_idx on campaign_keywords (business_id);

alter table campaign_keywords enable row level security;
create policy campaign_keywords_all on campaign_keywords
  for all to authenticated
  using (internal.is_business_member(business_id))
  with check (internal.is_business_member(business_id));

-- Set once, at match time (lib/prevent/process.ts), from the matched
-- campaign_keywords row's campaign_name — denormalized text, not a foreign
-- key, same convention as escalation_reason: a campaign_keywords row can be
-- deleted later without orphaning or corrupting the historical record of
-- which campaign a conversation actually came from.
alter table conversations add column campaign_source text;

-- "Update the knowledge base via WhatsApp" flow 2 (scoped in chat
-- 2026-09-25, Option B — threshold 7): a batch of newly-extracted pending
-- knowledge_items gets pushed to the single highest-priority team
-- member's WhatsApp as a numbered, repliable digest when the batch is
-- small (<= 7 items); a larger batch just gets a "N items pending, check
-- the dashboard" notice instead — bulk-approving a large batch blind off
-- a phone screen isn't a good review experience even where technically
-- possible, so it deliberately isn't built.
--
-- One row per digest, holding the whole ordered item list (unlike
-- knowledge_gap_question_routes' one-row-per-question shape) — a digest
-- reply like "approve 1,3" needs to resolve multiple positions against
-- one send, so an array column fits this shape better than N join rows.
create table knowledge_review_digests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  whatsapp_message_id text not null unique,
  recipient_wa_id text not null,
  item_ids uuid[] not null,
  created_at timestamptz not null default now()
);

create index knowledge_review_digests_business_id_idx on knowledge_review_digests (business_id);

alter table knowledge_review_digests enable row level security;
-- Deliberately no policy for authenticated/anon — same "service-role only"
-- discipline as whatsapp_reply_routes/knowledge_gap_question_routes.

-- Answering a knowledge-gap question via WhatsApp (scoped in chat
-- 2026-09-25, "flow 1" of "update the knowledge base via WhatsApp" —
-- deliberately the smallest of three possible flows: answering a specific
-- question Capture already asked, not free-form KB editing). A gap
-- question has no conversation, so the existing whatsapp_reply_routes
-- table (hardwired to conversation_id not null, see
-- 20260914010000_whatsapp_reply_routes.sql) can't be reused as-is — this
-- is a deliberate sibling table, not an extension of that one, so neither
-- table has to carry a nullable column for the other's case.
create table knowledge_gap_question_routes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  knowledge_gap_question_id uuid not null references knowledge_gap_questions(id) on delete cascade,
  whatsapp_message_id text not null unique,
  recipient_wa_id text not null,
  created_at timestamptz not null default now()
);

create index knowledge_gap_question_routes_business_id_idx on knowledge_gap_question_routes (business_id);

alter table knowledge_gap_question_routes enable row level security;
-- Deliberately no policy for authenticated/anon — same "service-role only"
-- discipline as whatsapp_reply_routes (holds no secret itself, but only
-- ever read/written by the webhook and notification code, never directly
-- by a business's own session).

-- Marks a question as already pushed via WhatsApp, so the one-question-
-- at-a-time queue (lib/notifications/knowledge-gap-whatsapp.ts) doesn't
-- send it twice, and so a business with no WhatsApp-connected team member
-- just leaves this null forever and keeps working purely from the
-- dashboard, unaffected.
alter table knowledge_gap_questions add column sent_at timestamptz;

-- Provenance for a knowledge item answered via WhatsApp, distinct from
-- 'manual' (the web form) — both are equally a human directly typing the
-- content, but the source should still say which surface, matching the
-- discipline 20260922000000_knowledge_item_source.sql established.
alter table knowledge_items drop constraint knowledge_items_source_check;
alter table knowledge_items add constraint knowledge_items_source_check
  check (source in ('unknown', 'manual', 'vertical_template', 'document', 'website', 'instagram_import', 'conversation_close', 'whatsapp_gap_answer'));

-- external_conversation_id / external_customer_id: mirrors the existing
-- messages.external_message_id pattern ("for idempotent webhook ingestion,
-- Phase 1.4b") one level up. Needed for two things that both land in
-- Phase 5.2: (1) historical message retrieval must be safe to re-run
-- (reconnect, retry) without creating duplicate customers/conversations,
-- and (2) the live webhook (next checklist item) needs a join key to route
-- an inbound event into an existing conversation rather than always
-- creating a new one. `customers.handle` (username) is display-only and
-- can change; the numeric Instagram-scoped id is the stable identity.

alter table customers
  add column external_customer_id text;

create unique index customers_external_customer_id_idx
  on customers (business_id, external_customer_id)
  where external_customer_id is not null;

alter table conversations
  add column external_conversation_id text;

create unique index conversations_external_conversation_id_idx
  on conversations (business_id, external_conversation_id)
  where external_conversation_id is not null;

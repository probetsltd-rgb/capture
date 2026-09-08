-- WhatsApp ingestion (PRD §27 Step 1's "Connect WhatsApp", DEP-1 cleared
-- 2026-09-08 — see OUTSTANDINGS.md). channel_connections/conversations were
-- already designed generically enough (channel/source check constraints
-- already include 'whatsapp'/'whatsapp_api', added back when the
-- simulate-inbound harness first used those values) that no change is
-- needed there.
--
-- One real gap: external_account_id alone isn't enough for WhatsApp. For
-- Instagram it's the one id needed for everything (send, webhook lookup).
-- For WhatsApp, sending/receiving key off `phone_number_id` (stored as
-- external_account_id, same convention as the table's own original
-- comment anticipated: "Instagram-scoped user id (or WhatsApp
-- phone_number_id later)") but subscribing the app to webhooks and
-- refreshing the business token both key off the WhatsApp Business
-- Account id instead — a second real id, not a duplicate of the first.
alter table channel_connections add column waba_id text;

comment on column channel_connections.waba_id is 'WhatsApp Business Account id — distinct from external_account_id (the phone_number_id used for sending/receiving). Null for non-WhatsApp channels.';

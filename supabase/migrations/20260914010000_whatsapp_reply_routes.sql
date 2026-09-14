-- Founder request 2026-09-14: cross-channel reply threading. A team member
-- who swipe-replies (WhatsApp's native quoted-reply gesture) to an
-- escalation/handler-notification WhatsApp message should have that reply
-- routed back to the ORIGINAL conversation (which may be on a different
-- channel, e.g. Instagram) as their real answer to the customer — not
-- processed as a brand-new, unrelated inbound WhatsApp message from an
-- unrecognized number (the real bug this closes: a live test produced a
-- stray customer/conversation and an AI-generated reply to the founder's
-- own WhatsApp reply text).
--
-- whatsapp_message_id is the wamid Meta returns when Capture sends the
-- notification (sendTemplateMessage's response) — the swipe-reply's inbound
-- webhook payload carries this back as messages[].context.id, which is the
-- only correlation WhatsApp's API gives us. recipient_wa_id (normalized,
-- digits only, no "+") is stored alongside it purely as defense in depth:
-- the webhook only trusts a context.id match if the inbound sender also
-- matches who that specific notification was actually sent to, so a
-- forwarded/leaked notification can't be swipe-replied-to by someone else
-- to hijack another conversation.
--
-- No RLS policy for `authenticated` — same discipline as channel_connections
-- (whose own migration this comment borrows from): this table is pure
-- internal plumbing between the notification senders and the webhook
-- receiver, never queried by business-facing client code, so only the
-- service-role client needs (or gets) access to it.
create table whatsapp_reply_routes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  whatsapp_message_id text not null unique,
  recipient_wa_id text not null,
  created_at timestamptz not null default now()
);

create index whatsapp_reply_routes_business_id_idx on whatsapp_reply_routes (business_id);

alter table whatsapp_reply_routes enable row level security;
-- Deliberately no policy for `authenticated`/`anon` — RLS with zero
-- policies denies all access by default; only the service-role client can
-- read/write this table.

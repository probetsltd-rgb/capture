-- Fourth channel: Facebook Page Messenger (roadmap confirmed 2026-09-08,
-- see OUTSTANDINGS.md's "Channel roadmap confirmed" note). A genuinely
-- different product from Instagram's Instagram-Login flow — needs a linked
-- Facebook Page, Facebook Login for Business (same mechanism WhatsApp's
-- Embedded Signup already uses), and Page Access Tokens — but reuses
-- channel_connections and the conversations/messages tables unchanged,
-- exactly as this schema was built to allow.
alter table channel_connections drop constraint channel_connections_channel_check;
alter table channel_connections add constraint channel_connections_channel_check
  check (channel in ('instagram', 'whatsapp', 'facebook'));

alter table conversations drop constraint conversations_channel_check;
alter table conversations add constraint conversations_channel_check
  check (channel in ('whatsapp', 'instagram', 'facebook', 'other'));

alter table customers drop constraint customers_source_check;
alter table customers add constraint customers_source_check
  check (source in ('manual_export', 'whatsapp_api', 'instagram_api', 'facebook_api', 'manual_entry'));

alter table conversations drop constraint conversations_source_check;
alter table conversations add constraint conversations_source_check
  check (source in ('manual_export', 'whatsapp_api', 'instagram_api', 'facebook_api'));

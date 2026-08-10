-- PRD §17D lead qualification fields, extracted opportunistically by the
-- Prevent response engine (web/src/lib/prevent/engine.ts) and merged onto
-- the conversation over time — never overwritten with a null once a field
-- has been captured.

alter table conversations
  add column qualification jsonb not null default '{}'::jsonb;

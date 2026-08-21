-- channel_connections: per-business OAuth-connected messaging channels
-- (PLANS.md Phase 5.2, Capture_PRD_Addendum_v2.md §15, §24). Instagram is
-- the first channel; the table is channel-agnostic by design (mirrors
-- conversations.channel) so WhatsApp can reuse it later without a redesign
-- (§24's "Channel Adapter" abstraction, P3 — not built yet, just not
-- blocked by this schema).
--
-- Deliberately holds an OAuth access token, so it gets stricter access than
-- every other tenant table in this schema: RLS is enabled with NO policy
-- for `authenticated` at all, meaning the table is unreachable through the
-- normal RLS-governed client regardless of business membership. All reads
-- and writes go through the service-role client from server-only code
-- (Route Handlers / Server Actions), the same discipline already used for
-- the public Find intake form's business creation. A business-facing "is
-- Instagram connected" UI must go through a small server-only helper that
-- checks the caller's own business_id first (getOwnBusinessId), not a
-- direct client-side select — see web/src/lib/channels/instagram.ts.
--
-- access_token_encrypted is application-layer AES-256-GCM ciphertext (see
-- web/src/lib/channels/token-crypto.ts), not plaintext and not pgcrypto —
-- this repo has no existing pgcrypto/pgsodium usage, and Node's built-in
-- crypto matches the existing convention in lib/upload-token.ts.

create table channel_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  channel text not null check (channel in ('instagram', 'whatsapp')),
  external_account_id text not null, -- Instagram-scoped user id (or WhatsApp phone_number_id later)
  username text,
  access_token_encrypted text not null,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One active connection per business+channel — a reconnect should replace
-- the existing row (upsert), not silently accumulate duplicates that the
-- webhook lookup (business_id from external_account_id) would then have to
-- disambiguate.
create unique index channel_connections_business_channel_active_idx
  on channel_connections (business_id, channel)
  where disconnected_at is null;

-- The webhook receiver's future lookup path: external_account_id -> business_id.
create index channel_connections_external_account_idx
  on channel_connections (channel, external_account_id)
  where disconnected_at is null;

create index channel_connections_business_id_idx on channel_connections (business_id);

create trigger channel_connections_set_updated_at before update on channel_connections
  for each row execute function set_updated_at();

alter table channel_connections enable row level security;
-- Deliberately no policy for `authenticated`/`anon` — see header comment.
-- RLS with zero policies denies all access by default; only the
-- service-role client (which bypasses RLS) can read/write this table.

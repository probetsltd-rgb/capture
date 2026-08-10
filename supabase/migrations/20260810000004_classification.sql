-- CAPTURE — Phase 1.5 support: track classification runs separately from
-- the classification result columns (which already existed on
-- conversations since the initial schema). classified_at distinguishes
-- "not yet classified" from "classified as none/unknown" (both would
-- otherwise look identical if we only checked whether conversation_type is
-- null). classification_notes is a short model-provided justification,
-- kept for debugging/audit — not shown to end users.

alter table conversations
  add column classified_at timestamptz,
  add column classification_notes text;

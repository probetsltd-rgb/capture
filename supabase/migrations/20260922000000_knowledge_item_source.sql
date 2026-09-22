-- Provenance for knowledge_items: until now a pending item extracted from a
-- real handled conversation (extractKnowledgeFromTeamReplies) looked
-- identical in the review UI to one scraped from a brochure or an industry
-- starter template — a business owner reviewing "Needs your review" had no
-- way to tell them apart. This makes the source explicit and visible.
--
-- Existing rows default to 'unknown' rather than a guessed value (e.g.
-- 'manual') — we have no reliable way to recover the true origin of rows
-- inserted before this column existed, and mislabeling them would be worse
-- than an honest "unknown". Every insert site in the app is updated
-- alongside this migration to always pass an explicit source going
-- forward, so 'unknown' should only ever apply to pre-migration rows.
alter table knowledge_items
  add column source text not null default 'unknown'
    check (source in ('unknown', 'manual', 'vertical_template', 'document', 'website', 'instagram_import', 'conversation_close'));

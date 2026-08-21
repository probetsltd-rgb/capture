-- Founder request 2026-08-21: let a business attach an actual photo/video
-- to a product knowledge item (uploaded directly, not a link to an
-- external site), so the response engine can send it as a native inline
-- attachment in the DM thread via Instagram's Messaging API — keeping the
-- customer in-conversation instead of sending them off Instagram to view
-- media. media_type is deliberately not a separate column: it's inferred
-- from the URL's file extension at send time (Vercel Blob preserves the
-- original filename), one less thing to keep in sync.

alter table knowledge_items
  add column media_url text;

comment on column knowledge_items.media_url is
  'Public Vercel Blob URL for a photo/video attached to this knowledge item (typically a product). When the response engine shares this item to answer a media request, it sends the file as a native inline Instagram attachment via the Messaging API, not a text link.';

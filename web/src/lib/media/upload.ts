import "server-only";
import { put } from "@vercel/blob";

// Bounds match Instagram's own documented attachment limits exactly
// (confirmed against Meta's current Messaging API docs 2026-08-21) —
// deliberately not more permissive than what Instagram will actually
// accept, so a business never uploads something that fails silently at
// send time, days or weeks later when a customer actually asks for it.
const IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/ogg", "video/avi", "video/quicktime", "video/webm", "video/x-msvideo"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

export type MediaUploadResult = { ok: true; url: string } | { ok: false; message: string };

export async function uploadKnowledgeMedia(businessId: string, file: File): Promise<MediaUploadResult> {
  const isImage = IMAGE_TYPES.has(file.type);
  const isVideo = VIDEO_TYPES.has(file.type);
  if (!isImage && !isVideo) {
    return { ok: false, message: "Photos must be PNG or JPEG; videos must be MP4, MOV, WebM, OGG, or AVI." };
  }

  const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > maxBytes) {
    return {
      ok: false,
      message: isImage ? "Photos must be under 8MB." : "Videos must be under 25MB.",
    };
  }

  // Pathname prefixed by businessId so files are trivially attributable
  // and groupable in the Blob store's own listing without needing a
  // separate index — matches the "reuse what exists" discipline applied
  // elsewhere this session rather than inventing new bookkeeping.
  const blob = await put(`knowledge/${businessId}/${crypto.randomUUID()}-${file.name}`, file, {
    access: "public",
    addRandomSuffix: false,
  });

  return { ok: true, url: blob.url };
}

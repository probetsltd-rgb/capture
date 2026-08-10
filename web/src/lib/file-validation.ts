// Upload validation for the manual WhatsApp export path (PLANS.md Phase 1.2
// "Upload validation (type/size limits) on the export-upload endpoint").
//
// .txt only for V1 — WhatsApp's native export offers "without media" (a
// plain .txt) as the recommended option (phase0/AUDIT_GUIDE.md §2), and
// skipping .zip entirely avoids the zip-bomb / decompression attack surface
// the Cross-Cutting Security Workstream flags, rather than needing to
// defend against it. Revisit if a real business needs media-inclusive
// exports.

export const MAX_FILES_PER_UPLOAD = 60; // PRD §7: ~20–50 conversations, plus headroom
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // WhatsApp text exports are typically well under 1MB

export type FileValidationResult = { ok: true } | { ok: false; reason: string };

export function validateUploadBatch(files: File[]): FileValidationResult {
  if (files.length === 0) {
    return { ok: false, reason: "Please choose at least one .txt export file." };
  }
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return {
      ok: false,
      reason: `Too many files at once (max ${MAX_FILES_PER_UPLOAD}). Please upload in smaller batches.`,
    };
  }
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".txt")) {
      return { ok: false, reason: `${file.name}: only .txt exports are accepted.` };
    }
    if (file.size === 0) {
      return { ok: false, reason: `${file.name}: file is empty.` };
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        ok: false,
        reason: `${file.name}: file too large (max ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB).`,
      };
    }
  }
  return { ok: true };
}

// Content-level sniff, separate from the metadata checks above — a renamed
// binary file passes the extension/size checks but not this. WhatsApp
// exports are plain text; reject anything containing NUL bytes or an
// excessive proportion of non-printable characters.
export function looksLikeText(buffer: Uint8Array): boolean {
  if (buffer.length === 0) return false;
  const sampleSize = Math.min(buffer.length, 8192);
  let suspicious = 0;
  for (let i = 0; i < sampleSize; i++) {
    const byte = buffer[i];
    if (byte === 0) return false; // NUL byte — definitely not text
    const isPrintableAscii = byte >= 0x20 && byte <= 0x7e;
    const isCommonWhitespace = byte === 0x09 || byte === 0x0a || byte === 0x0d;
    const isLikelyUtf8Continuation = byte >= 0x80; // allow non-ASCII (names, emoji)
    if (!isPrintableAscii && !isCommonWhitespace && !isLikelyUtf8Continuation) {
      suspicious++;
    }
  }
  return suspicious / sampleSize < 0.05;
}

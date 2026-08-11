// Upload validation for the manual export paths (PLANS.md Phase 1.2 "Upload
// validation (type/size limits) on the export-upload endpoint").
//
// .txt (WhatsApp) and .json (Instagram's "Download Your Information" export)
// only — no .zip. Instagram's export is a zip containing many message_N.json
// files across subfolders; users are asked to extract it themselves rather
// than Capture handling the archive, for the same reason WhatsApp never grew
// .zip support: skipping archive extraction entirely avoids the zip-bomb /
// decompression attack surface the Cross-Cutting Security Workstream flags,
// rather than needing to defend against it. Revisit only if this becomes a
// real onboarding blocker.

export const MAX_FILES_PER_UPLOAD = 120; // PRD §7: ~20–50 conversations; Instagram exports can split one conversation across several message_N.json pages, so this allows headroom beyond a 1-file-per-conversation assumption
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // both export formats are typically well under 1MB per file

const ACCEPTED_EXTENSIONS = [".txt", ".json"];

export type FileValidationResult = { ok: true } | { ok: false; reason: string };

export function validateUploadBatch(files: File[]): FileValidationResult {
  if (files.length === 0) {
    return { ok: false, reason: "Please choose at least one export file (.txt or .json)." };
  }
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return {
      ok: false,
      reason: `Too many files at once (max ${MAX_FILES_PER_UPLOAD}). Please upload in smaller batches.`,
    };
  }
  for (const file of files) {
    const name = file.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      return { ok: false, reason: `${file.name}: only .txt (WhatsApp) or .json (Instagram) exports are accepted.` };
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

// Instagram-specific content sniff, parallel to looksLikeText above — a
// renamed file that happens to be valid JSON (or plain text with a .json
// extension) still needs to actually have the shape Meta's export produces,
// or it's silently treated by the parser as "no messages found" with no
// explanation of why.
export function looksLikeInstagramExport(text: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as { messages?: unknown }).messages)
  );
}

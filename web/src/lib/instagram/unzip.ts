// Client-side ZIP reader, browser-only (uses DecompressionStream). Purpose-
// built for Instagram's "Download Your Information" export — not a general
// zip library. Supports only Stored and Deflate entries (the only two
// methods any standard zip tool produces) and only files small enough this
// product could plausibly need (message JSON, never video). Anything
// outside that fails clearly rather than being silently mishandled.
//
// Runs entirely in the browser tab that selected the file — the server
// never receives or decompresses a zip. That's the actual point: it's what
// lets this exist at all without reopening the zip-bomb/decompression
// attack-surface decision that kept zip support out of the server-side
// upload path (see file-validation.ts's own comment on that). A hung or
// crashed *user's own tab* from a malformed archive is a low-stakes failure
// mode; a hung shared server is not — but the bounds below exist anyway, so
// even that stays bounded rather than open-ended.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

const MAX_ENTRIES = 2000; // a "Messages only" export is dozens–hundreds of small JSON files, not thousands
const MAX_SINGLE_FILE_BYTES = 20 * 1024 * 1024; // generous for a JSON conversation export
const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // aggregate ceiling across the whole archive

export type UnzippedTextFile = { name: string; text: string };
export type UnzipDiagnostics = { totalEntries: number; extensionCounts: Record<string, number> };

export class ZipParseError extends Error {}

function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}
function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

// EOCD sits near the end, after a variable-length (possibly zero) comment
// field, so its position has to be found by scanning backward for its
// signature rather than assumed fixed. 22 is EOCD's fixed size; a comment
// can be up to 65535 bytes, per the format's own comment-length field width.
function findEndOfCentralDirectory(bytes: Uint8Array, view: DataView): number {
  const maxCommentLength = 65535;
  const minPos = Math.max(0, bytes.length - 22 - maxCommentLength);
  for (let i = bytes.length - 22; i >= minPos; i--) {
    if (u32(view, i) === EOCD_SIGNATURE) return i;
  }
  throw new ZipParseError("Not a valid zip file (no end-of-central-directory record found).");
}

async function inflateRaw(compressed: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new ZipParseError("This browser doesn't support automatic zip extraction.");
  }
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Extracts every .json entry from a zip archive, decompressing entirely in
 * the browser. Non-.json entries (photos, other export categories, folder
 * entries) are skipped by name before any decompression is attempted, not
 * discarded after — a "Messages only" export should mean there are few of
 * these, but nothing here assumes that.
 *
 * Also returns a count of every extension actually present in the archive
 * (not just .json), even when nothing is extracted — the single most useful
 * fact for diagnosing a real-world "found nothing" case (e.g. the export
 * was generated in HTML format instead of JSON, which produces a
 * structurally identical-looking zip that legitimately contains zero .json
 * files) without needing the file's actual content, which callers
 * shouldn't need to inspect or forward anywhere just to explain an error.
 */
export async function unzipJsonFiles(
  zipBytes: Uint8Array,
): Promise<{ files: UnzippedTextFile[]; diagnostics: UnzipDiagnostics }> {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(zipBytes, view);

  const totalEntries = u16(view, eocdOffset + 10);
  const centralDirSize = u32(view, eocdOffset + 12);
  const centralDirOffset = u32(view, eocdOffset + 16);

  if (centralDirOffset === 0xffffffff || totalEntries === 0xffff) {
    throw new ZipParseError(
      "This archive uses Zip64 (very large archive format), which isn't supported here — please extract it and upload the .json files individually.",
    );
  }
  if (totalEntries > MAX_ENTRIES) {
    throw new ZipParseError(
      `Archive has too many files (${totalEntries}, max ${MAX_ENTRIES}) — please extract it and upload the relevant .json files individually.`,
    );
  }

  const decoder = new TextDecoder("utf-8");
  const results: UnzippedTextFile[] = [];
  const extensionCounts: Record<string, number> = {};
  let totalBytesExtracted = 0;

  let pos = centralDirOffset;
  const centralDirEnd = centralDirOffset + centralDirSize;

  for (let i = 0; i < totalEntries; i++) {
    if (pos + 46 > zipBytes.length || pos >= centralDirEnd) {
      throw new ZipParseError("Archive's central directory is malformed or truncated.");
    }
    if (u32(view, pos) !== CENTRAL_DIR_SIGNATURE) {
      throw new ZipParseError("Archive's central directory is malformed (unexpected entry signature).");
    }

    const compressionMethod = u16(view, pos + 10);
    const compressedSize = u32(view, pos + 20);
    const uncompressedSize = u32(view, pos + 24);
    const nameLength = u16(view, pos + 28);
    const extraLength = u16(view, pos + 30);
    const commentLength = u16(view, pos + 32);
    const localHeaderOffset = u32(view, pos + 42);

    const name = decoder.decode(zipBytes.subarray(pos + 46, pos + 46 + nameLength));

    // Always advance past the full record, whether or not this entry is
    // one we keep — later entries' correctness depends on it.
    pos += 46 + nameLength + extraLength + commentLength;

    if (!name.endsWith("/")) {
      const dot = name.lastIndexOf(".");
      const ext = dot === -1 ? "(no extension)" : name.slice(dot).toLowerCase();
      extensionCounts[ext] = (extensionCounts[ext] ?? 0) + 1;
    }

    if (!name.toLowerCase().endsWith(".json") || name.endsWith("/")) continue;

    if (uncompressedSize > MAX_SINGLE_FILE_BYTES) {
      throw new ZipParseError(
        `${name} is larger than expected (${Math.round(uncompressedSize / 1024 / 1024)}MB) — this doesn't look like a real Instagram export.`,
      );
    }
    totalBytesExtracted += uncompressedSize;
    if (totalBytesExtracted > MAX_TOTAL_BYTES) {
      throw new ZipParseError("Archive is larger than expected overall — this doesn't look like a real Instagram export.");
    }

    // Locate the actual compressed data via the LOCAL file header at its own
    // offset — its filename/extra-field lengths can differ from the central
    // directory's, so they can't be assumed equal. Sizes are still taken
    // from the central directory: that's what makes archives using a
    // trailing "data descriptor" (local header size fields zeroed) work
    // correctly here without needing to special-case them.
    if (localHeaderOffset + 30 > zipBytes.length) {
      throw new ZipParseError(`${name}: local file header is out of range.`);
    }
    if (u32(view, localHeaderOffset) !== LOCAL_FILE_SIGNATURE) {
      throw new ZipParseError(`${name}: local file header signature mismatch.`);
    }
    const localNameLength = u16(view, localHeaderOffset + 26);
    const localExtraLength = u16(view, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > zipBytes.length) {
      throw new ZipParseError(`${name}: compressed data extends past the end of the archive.`);
    }
    // .slice(), not .subarray(): Blob requires a real ArrayBuffer-backed
    // view, and a .subarray() over the original file's buffer can be typed
    // as the wider ArrayBufferLike (which also covers SharedArrayBuffer).
    const compressedBytes = zipBytes.slice(dataStart, dataEnd);

    let fileBytes: Uint8Array;
    if (compressionMethod === 0) {
      fileBytes = compressedBytes;
    } else if (compressionMethod === 8) {
      fileBytes = await inflateRaw(compressedBytes);
    } else {
      continue; // unsupported method on this one entry — skip it, don't fail the whole batch
    }

    // Basename only, matching what a flat multi-file <input> selection
    // would have produced — this is a drop-in replacement for that path,
    // not a parallel one the rest of the pipeline needs to know about.
    const baseName = name.split("/").pop() ?? name;
    results.push({ name: baseName, text: decoder.decode(fileBytes) });
  }

  return { files: results, diagnostics: { totalEntries, extensionCounts } };
}

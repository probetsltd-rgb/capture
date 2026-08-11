// Parses Meta's "Download Your Information" export for Instagram DMs
// (Settings → Accounts Center → Your Information and Permissions → Export
// Your Information → Messages only → JSON format) into the same
// ParsedConversation/ParsedMessage shape whatsapp/parse.ts produces, so the
// rest of the ingestion pipeline (chunking, classification) doesn't need to
// know which channel a conversation came from.
//
// Three real correctness hazards here, none of which exist for WhatsApp's
// plain-text export:
//
// 1. Meta's JSON writer has a well-documented bug: multi-byte UTF-8 text is
//    escaped one RAW BYTE at a time (e.g. the Naira sign U+20A6, UTF-8 bytes
//    E2 82 A6, comes out as the literal escape sequence â¦)
//    instead of escaping the actual Unicode codepoint. A standard JSON.parse
//    silently "succeeds" and hands back a mojibake string. fixMojibake()
//    reverses this by reinterpreting the decoded string's UTF-16 code units
//    as raw bytes and re-decoding as UTF-8 — see its own comment for why
//    this is safe to apply unconditionally.
// 2. A long conversation is split across message_1.json, message_2.json,
//    etc., and nothing guarantees the array inside each file is
//    chronological — messages must be sorted by timestamp_ms after merging,
//    never trusted in file order.
// 3. Every conversation's export file is literally named message_1.json —
//    the conversation identity lives in the JSON content (title/
//    participants), not the filename. A flat multi-file browser upload
//    cannot disambiguate conversations by name the way WhatsApp's export
//    (which bakes the other party's name into the filename) can, so grouping
//    has to happen by content — see groupInstagramExportFiles().

import type { ParsedConversation, ParsedMessage } from "@/lib/whatsapp/parse";

type InstagramRawMessage = {
  sender_name?: string;
  timestamp_ms?: number;
  content?: string;
};

type InstagramExportFile = {
  participants?: { name?: string }[];
  title?: string;
  messages?: InstagramRawMessage[];
};

/**
 * Reverses Meta's byte-as-codepoint mis-encoding. Safe to apply
 * unconditionally: ASCII text (the majority of most conversations) is
 * identical whether read as UTF-8 or Latin-1, so this is a no-op for it.
 * Only genuinely mis-encoded multi-byte sequences change, and `fatal: true`
 * means a string that was never mojibake in the first place (and so doesn't
 * happen to decode as valid UTF-8 when reinterpreted as bytes) falls back to
 * itself rather than being corrupted by a bad "fix".
 */
export function fixMojibake(value: string): string {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 0xff) return value; // not byte-per-char — definitely not this bug, leave untouched
    bytes[i] = code;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return value;
  }
}

/**
 * Groups a batch of raw message_N.json file contents into per-conversation
 * buckets using the JSON content itself (title, falling back to the sorted
 * participant list) rather than filename — every file in a real export is
 * named message_1.json regardless of which conversation it belongs to.
 * Files that fail to parse as JSON or don't look like this export format are
 * silently excluded (caller reports them as skipped via the returned set).
 */
export function groupInstagramExportFiles(
  files: { name: string; text: string }[],
): { groups: Map<string, InstagramExportFile[]>; unparseable: string[] } {
  const groups = new Map<string, InstagramExportFile[]>();
  const unparseable: string[] = [];

  for (const file of files) {
    let parsed: InstagramExportFile;
    try {
      parsed = JSON.parse(file.text);
    } catch {
      unparseable.push(file.name);
      continue;
    }
    if (!Array.isArray(parsed.messages)) {
      unparseable.push(file.name);
      continue;
    }

    const key =
      parsed.title ??
      (parsed.participants ?? [])
        .map((p) => p.name ?? "")
        .filter(Boolean)
        .sort()
        .join("|") ??
      file.name;

    const bucket = groups.get(key);
    if (bucket) bucket.push(parsed);
    else groups.set(key, [parsed]);
  }

  return { groups, unparseable };
}

/**
 * Parses one conversation's already-grouped set of export-file pages (see
 * groupInstagramExportFiles) into the shared ParsedConversation shape.
 * Returns null if no usable text messages were found — mirrors
 * parseWhatsAppExport's contract so callers treat both the same way.
 */
export function parseInstagramConversation(pages: InstagramExportFile[]): ParsedConversation | null {
  const messages: ParsedMessage[] = [];

  for (const page of pages) {
    for (const raw of page.messages ?? []) {
      // Media-only messages (photo/sticker/call-log shares) have no
      // `content` field. Skipped rather than represented with a placeholder
      // — better to under-count than fabricate a body the classifier would
      // then reason about as if it were real text.
      if (!raw.content || !raw.sender_name || typeof raw.timestamp_ms !== "number") continue;

      messages.push({
        sender: fixMojibake(raw.sender_name),
        body: fixMojibake(raw.content),
        sentAt: new Date(raw.timestamp_ms),
      });
    }
  }

  if (messages.length === 0) return null;

  // Never trust in-file order — see the module comment.
  messages.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());

  return {
    messages,
    firstMessageAt: messages[0].sentAt,
    lastMessageAt: messages[messages.length - 1].sentAt,
  };
}

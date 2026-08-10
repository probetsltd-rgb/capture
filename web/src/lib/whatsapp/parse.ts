// TypeScript port of phase0/parse_whatsapp_exports.py's parsing logic, for
// use in the actual product (Vercel Functions run Node, not Python).
// Difference from the Python version: that script deliberately only reads
// timestamps/senders for the founder's manual audit CSV, never message
// content. This one extracts full message text, because Phase 1.5's
// classification pipeline needs real content to classify against.

export type ParsedMessage = {
  sender: string;
  body: string;
  sentAt: Date;
};

export type ParsedConversation = {
  messages: ParsedMessage[];
  firstMessageAt: Date;
  lastMessageAt: Date;
};

const INVISIBLE_MARKS = /[‎‏]/g;

const IOS_PATTERN =
  /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}), (\d{1,2}):(\d{2})(?::(\d{2}))?\s?(AM|PM|am|pm)?\] (.+?): (.*)$/;
const ANDROID_MESSAGE_PATTERN =
  /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}), (\d{1,2}):(\d{2})\s?(AM|PM|am|pm)?\s-\s(.+?): (.*)$/;
const ANDROID_SYSTEM_PATTERN =
  /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}), (\d{1,2}):(\d{2})\s?(AM|PM|am|pm)?\s-\s(.*)$/;

function toDate(
  dd: string,
  mm: string,
  yy: string,
  hh: string,
  mi: string,
  ss: string | undefined,
  ampm: string | undefined,
  dateOrder: "dmy" | "mdy",
): Date | null {
  let y = parseInt(yy, 10);
  if (y < 100) y += 2000;
  let d = parseInt(dd, 10);
  let mo = parseInt(mm, 10);
  if (dateOrder === "mdy") [d, mo] = [mo, d];

  let hour = parseInt(hh, 10);
  if (ampm) {
    const upper = ampm.toUpperCase();
    if (upper === "PM" && hour !== 12) hour += 12;
    if (upper === "AM" && hour === 12) hour = 0;
  }

  const date = new Date(y, mo - 1, d, hour, parseInt(mi, 10), ss ? parseInt(ss, 10) : 0);
  // Reject impossible dates (e.g. month 13) rather than let JS silently roll
  // them into the next month/year.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

/**
 * Parse one WhatsApp chat export (one file = one conversation thread, per
 * WhatsApp's native "Export Chat"). Returns null if no messages parsed —
 * caller should skip the file with a warning, not treat it as an empty
 * conversation.
 */
export function parseWhatsAppExport(
  text: string,
  dateOrder: "dmy" | "mdy" = "dmy",
): ParsedConversation | null {
  const messages: ParsedMessage[] = [];
  let firstMessageAt: Date | null = null;
  let lastMessageAt: Date | null = null;

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(INVISIBLE_MARKS, "");
    if (!line.trim()) continue;

    let match = IOS_PATTERN.exec(line);
    let dd, mm, yy, hh, mi, ss, ampm, sender, body;
    if (match) {
      [, dd, mm, yy, hh, mi, ss, ampm, sender, body] = match;
    } else {
      match = ANDROID_MESSAGE_PATTERN.exec(line);
      if (match) {
        [, dd, mm, yy, hh, mi, ampm, sender, body] = match;
        ss = undefined;
      } else if (ANDROID_SYSTEM_PATTERN.test(line)) {
        // System/notification line (encryption notice, "X added Y") — not a
        // message, and not a continuation either.
        continue;
      } else {
        // Continuation of the previous multi-line message.
        if (messages.length > 0) {
          messages[messages.length - 1].body += "\n" + line;
        }
        continue;
      }
    }

    const sentAt = toDate(dd, mm, yy, hh, mi, ss, ampm, dateOrder);
    if (!sentAt) continue; // malformed timestamp — skip this line, don't abort the file

    messages.push({ sender: sender.trim(), body: body ?? "", sentAt });
    if (!firstMessageAt || sentAt < firstMessageAt) firstMessageAt = sentAt;
    if (!lastMessageAt || sentAt > lastMessageAt) lastMessageAt = sentAt;
  }

  if (messages.length === 0 || !firstMessageAt || !lastMessageAt) return null;
  return { messages, firstMessageAt, lastMessageAt };
}

/**
 * Given multiple parsed conversations from one business's upload batch,
 * guess which sender name is "the business" — it's the one participant
 * that recurs across most/all files, since each file is a different
 * customer talking to the same business. Returns null if no name clears
 * the threshold (e.g. only one file uploaded, or names don't repeat) —
 * caller should leave sender_type unresolved rather than guess wrong.
 */
export function guessBusinessSenderName(
  conversations: ParsedConversation[],
  minFraction = 0.6,
): string | null {
  if (conversations.length < 2) return null;

  const fileCountBySender = new Map<string, number>();
  for (const conv of conversations) {
    const sendersInFile = new Set(conv.messages.map((m) => m.sender));
    for (const sender of sendersInFile) {
      fileCountBySender.set(sender, (fileCountBySender.get(sender) ?? 0) + 1);
    }
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [sender, count] of fileCountBySender) {
    if (count > bestCount) {
      best = sender;
      bestCount = count;
    }
  }

  if (best && bestCount / conversations.length >= minFraction) return best;
  return null;
}

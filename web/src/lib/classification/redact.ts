// PII minimisation before conversation content leaves our system for the
// LLM call (Cross-Cutting Security Workstream, PLANS.md). Regex-based, so
// it only catches structured PII (phone numbers, emails) — free-text names
// are NOT scrubbed, since a regex/word-list approach produces too many
// false positives (redacting ordinary words) and false negatives (missing
// most real names) to be worth the complexity. See OUTSTANDINGS.md for the
// honest limitation this leaves.

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Matches Nigerian local (080..., 070...) and international (+234...,
// +1...) formats, and generic 7+ digit sequences with common separators —
// deliberately broad, since over-redacting a non-phone-number sequence of
// digits (e.g. an order number) is a much smaller cost than leaking a real
// phone number.
const PHONE_RE = /(\+?\d[\d\s\-().]{6,}\d)/g;

export function redactPii(text: string): string {
  return text.replace(EMAIL_RE, "[EMAIL]").replace(PHONE_RE, "[PHONE]");
}

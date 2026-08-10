// PRD §42 "rules before intelligence" — cheap, reliable, zero-latency
// checks for the most unambiguous escalation triggers (PRD §18), run
// before ever calling the AI. Deliberately conservative: only fires on
// clear, explicit requests, so it never falsely escalates a normal
// question. Nuanced cases (complaints without obvious keywords,
// negotiation, "uncertain answer") are left to the AI engine's own
// structured judgment — see engine.ts.

const HUMAN_REQUEST_PATTERNS = [
  /\b(speak|talk)\s+(to|with)\s+(a\s+)?(human|person|someone|agent|manager|representative)\b/i,
  /\bcustomer\s+service\b/i,
  /\breal\s+person\b/i,
  /\bis\s+(anyone|somebody)\s+(there|available)\b/i,
];

export function detectExplicitHumanRequest(message: string): boolean {
  return HUMAN_REQUEST_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Business-supplied additions (businesses.escalation_keywords, Phase 4
 * "Configure Rules") — plain substrings, matched case-insensitively. Kept
 * distinct from detectExplicitHumanRequest so the engine can report an
 * accurate escalation_reason rather than always claiming "asked for a
 * human" when what actually fired was e.g. a business's own "fraud" trigger.
 */
export function detectBusinessEscalationKeyword(message: string, extraKeywords: string[]): string | null {
  if (extraKeywords.length === 0) return null;
  const lower = message.toLowerCase();
  return extraKeywords.find((kw) => kw.trim() && lower.includes(kw.trim().toLowerCase())) ?? null;
}

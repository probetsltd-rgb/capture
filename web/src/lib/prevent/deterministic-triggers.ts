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

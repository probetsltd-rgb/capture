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

// Campaign keyword triggers (scoped in chat 2026-09-30) — a business
// running an ad campaign ("DM us the word CAPTURE") registers a keyword so
// that exact trigger is recognized as fresh interest, not silently
// escalated on as an ungrounded tier-D message (engine.ts's normal
// behavior for a one-word message with no knowledge to ground it).
// Deliberately STRICT near-exact matching, unlike
// detectBusinessEscalationKeyword's substring-anywhere match — a customer
// asking "can you capture that in a photo" must never misfire this. The
// message, after trimming and stripping only leading/trailing punctuation,
// must equal the keyword exactly; extra words anywhere disqualify it.
export type CampaignKeywordConfig = { keyword: string; campaignName: string; qualifyingPrompt: string | null };

function normalizeForCampaignMatch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

export function detectCampaignKeyword(message: string, campaignKeywords: CampaignKeywordConfig[]): CampaignKeywordConfig | null {
  if (campaignKeywords.length === 0) return null;
  const normalizedMessage = normalizeForCampaignMatch(message);
  if (!normalizedMessage) return null;
  return campaignKeywords.find((c) => normalizeForCampaignMatch(c.keyword) === normalizedMessage) ?? null;
}

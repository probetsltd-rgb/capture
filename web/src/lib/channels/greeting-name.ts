// Decides what (if anything) the AI should call a customer in a first-reply
// greeting. Pure and side-effect free so it's unit-testable and shared by
// every channel. Founder decision 2026-11-23 ("Hi Seanbims beats Hi there",
// but not at the cost of "Hi lagos_bakes_22"): prefer the first word of a
// real display name; fall back to the handle ONLY if it looks like a
// personal name; otherwise return null so the caller greets generically.

// A handle that merely contains one of these is almost certainly a brand
// or shop, not a person ("lagosbakes", "rentitstore"). Substring match on
// the lowercased handle; deliberately blunt — a false positive costs one
// generic "Hi there", a false negative costs an embarrassing greeting.
const BUSINESS_WORDS = [
  "shop", "store", "mart", "official", "ventures", "hub", "naija", "lagos", "abuja", "africa",
  "kitchen", "bakes", "bakery", "designs", "fashion", "beauty", "hair", "wears", "gadgets",
  "rental", "rent", "homes", "estate", "realty", "tech", "studio", "events", "luxury", "global",
  "enterprise", "limited", "ltd", "foods", "market", "wholesale", "boutique", "ng",
];

function capitalize(word: string): string {
  // Only normalise all-lower or all-upper ("SEUN", "seun"); leave mixed
  // case alone so "McDonald" / "DeShawn" aren't mangled.
  if (word === word.toLowerCase() || word === word.toUpperCase()) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
  return word;
}

// Letters only (any script), optional internal apostrophe/hyphen, 2-20 chars.
// Rejects digits, underscores, dots, emoji, handles-with-numbers, etc.
const NAME_TOKEN = /^\p{L}+(?:['’-]\p{L}+)*$/u;

function firstNameFromDisplayName(displayName: string | null | undefined): string | null {
  const token = displayName?.trim().split(/\s+/)[0];
  if (!token || token.length < 2 || token.length > 20 || !NAME_TOKEN.test(token)) return null;
  return capitalize(token);
}

function nameFromHandle(handle: string | null | undefined): string | null {
  const h = handle?.trim().replace(/^@/, "");
  if (!h || h.length < 3 || h.length > 12) return null; // long handles are usually brands
  if (!/^\p{L}+$/u.test(h)) return null; // no digits, dots, underscores
  const lower = h.toLowerCase();
  if (BUSINESS_WORDS.some((w) => lower.includes(w))) return null;
  return capitalize(h);
}

export function pickGreetingName(input: {
  displayName?: string | null;
  handle?: string | null;
}): string | null {
  return firstNameFromDisplayName(input.displayName) ?? nameFromHandle(input.handle);
}

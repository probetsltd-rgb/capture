import "server-only";
import { generateObject, NoObjectGeneratedError } from "ai";
import { classificationSchema, type Classification } from "./schema";
import { redactPii } from "./redact";

// Configurable so switching models/providers (AD-3: provider-agnostic via
// AI Gateway) is an env var change, not a code change. AI Gateway billing
// was resolved 2026-08-10 (OUTSTANDINGS.md DEP-5) — defaults to a paid-tier
// model now rather than the free-tier fallback used while that was blocked.
const MODEL = process.env.CLASSIFICATION_MODEL || "anthropic/claude-haiku-4.5";

const SYSTEM_PROMPT = `You classify WhatsApp business conversations for Capture, a revenue-leak diagnostic tool. Given a transcript (Business/Customer turns), classify it using exactly these categories:

conversation_type — what kind of conversation this is:
- sales_enquiry: customer asking about buying/booking a product or service
- existing_customer: an already-purchased customer following up (support, reorder, relationship)
- support: help with an existing product/service, not a new sale
- complaint: customer expressing dissatisfaction
- general: general question not fitting other categories
- spam_irrelevant: not a real business conversation
- unknown: cannot be determined from the transcript

intent — how strong the customer's buying signal is: high, medium, low, or none.

status — how the conversation concluded:
- converted: customer confirmed a purchase/booking
- likely_converted: strong signal of a completed sale, not explicitly confirmed
- abandoned: customer engaged, then went silent without buying
- no_response: business never replied to the customer
- unresolved: still open, no clear conclusion in this transcript
- unclear: cannot be determined

leakage_type — where revenue is being left on the table, if anywhere:
- no_response: business failed to respond at all
- delayed_response: business replied, but late enough a customer might have moved on
- abandoned_high_intent: customer showed real buying intent, then the conversation just ended
- quote_not_followed_up: a price/quote was given and never followed up
- reactivatable: a past customer who could plausibly be re-engaged
- other: a leak exists but doesn't fit the above
- none: no meaningful leakage — the conversation was handled well, or there was never a real opportunity

Base every field only on what's in the transcript. Do not assume information that isn't there.

For "reasoning", write at most one short sentence (under 400 characters). It's for internal debugging only, not shown to any user — do not write a detailed analysis.`;

/**
 * Classify one conversation's messages against the PRD §9 taxonomy.
 * Returns null (rather than throwing) when the model fails to produce a
 * schema-conformant result — callers should leave the conversation
 * unclassified and flag it for review, never store a guessed/partial
 * result. PII is redacted from message bodies before they're sent.
 */
export async function classifyConversation(
  messages: { sender_type: string; body: string | null }[],
): Promise<Classification | null> {
  const transcript = messages
    .map((m) => `${m.sender_type === "business" ? "Business" : "Customer"}: ${redactPii(m.body ?? "")}`)
    .join("\n");

  try {
    const { object } = await generateObject({
      model: MODEL,
      schema: classificationSchema,
      system: SYSTEM_PROMPT,
      prompt: `Classify this conversation:\n\n${transcript}`,
    });
    return object;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      return null;
    }
    throw error;
  }
}

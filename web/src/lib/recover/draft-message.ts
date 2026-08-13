import "server-only";
import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { redactPii } from "@/lib/classification/redact";

// Same model choice as classification (web/src/lib/classification/classify.ts)
// — configurable for the same reason (AD-3: provider-agnostic via AI Gateway).
const MODEL = process.env.CLASSIFICATION_MODEL || "anthropic/claude-haiku-4.5";

const draftSchema = z.object({
  message: z
    .string()
    .max(600)
    .describe("The actual outreach message, ready to send as-is — no placeholders, no brackets"),
});

// Tone/opening guidance per leakage_type (PRD §9 taxonomy) — a message
// re-opening a conversation the business never answered needs a different
// opener than one following up on a quote, or reconnecting with an old
// customer. Mirrors the categories classify.ts already assigns, so no new
// taxonomy is introduced here.
const LEAK_GUIDANCE: Record<string, string> = {
  no_response:
    "The business never replied to this customer at all. Open by briefly acknowledging that, without over-apologising, then get straight to helping them.",
  delayed_response:
    "The business replied, but late enough the customer may have moved on. A warm, low-key check-in works better than a lengthy apology.",
  abandoned_high_intent:
    "The customer showed real buying interest and the conversation just stopped. Reopen naturally, referencing what they were actually asking about.",
  quote_not_followed_up:
    "A price or quote was given and never followed up on. Ask if they're still considering it and offer to answer anything unresolved — do not restate a specific price unless it's clearly in the transcript.",
  reactivatable:
    "A past customer who could plausibly be re-engaged. Keep it warm and low-pressure — a genuine check-in, not a sales pitch.",
  other: "Reopen the conversation naturally based on what was actually discussed.",
};

/**
 * Drafts a single outbound message reopening a stalled conversation, in the
 * business's own voice. Returns null (never throws for a model-quality
 * failure) so a bad draft never silently becomes garbage automation data —
 * same contract as classifyConversation.
 */
export async function generateOutreachDraft(params: {
  businessName: string;
  leakageType: string;
  messages: { sender_type: string; body: string | null }[];
}): Promise<string | null> {
  const transcript = params.messages
    .map((m) => `${m.sender_type === "business" ? params.businessName : "Customer"}: ${redactPii(m.body ?? "")}`)
    .join("\n");

  const guidance = LEAK_GUIDANCE[params.leakageType] ?? LEAK_GUIDANCE.other;

  try {
    const { object } = await generateObject({
      model: MODEL,
      schema: draftSchema,
      system: `You draft ONE outbound WhatsApp/Instagram DM for "${params.businessName}" to send to a real customer, reopening a stalled conversation. Write like a real person at this business texting a customer — natural, warm, brief (2-4 short sentences). Never sound like a bot, a template, or an email ("Dear Customer" etc.). Never invent facts, prices, dates, or promises that aren't in the transcript below. ${guidance}`,
      prompt: `Conversation so far:\n\n${transcript}\n\nDraft the next message from ${params.businessName} to this customer.`,
    });
    return object.message;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) return null;
    throw error;
  }
}

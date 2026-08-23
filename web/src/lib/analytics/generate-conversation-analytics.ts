import "server-only";
import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { redactPii } from "@/lib/classification/redact";

const MODEL = process.env.PREVENT_MODEL || "anthropic/claude-haiku-4.5";

const analyticsSchema = z.object({
  recurring_asks: z
    .array(
      z.object({
        ask: z.string().max(200).describe("A distinct thing customers repeatedly asked about, in their own words."),
        count: z.number().int().min(2).describe("How many separate conversations raised this."),
      }),
    )
    .max(10)
    .describe("Only things that came up more than once — a single mention is not a pattern."),
  escalation_themes: z
    .array(
      z.object({
        theme: z.string().max(200).describe("A recurring reason conversations needed a human."),
        count: z.number().int().min(2),
      }),
    )
    .max(10),
  knowledge_gaps: z
    .array(
      z
        .string()
        .max(300)
        .describe("A specific thing customers asked about that the approved knowledge base below does not cover."),
    )
    .max(10)
    .describe("Meant to directly inform what the business should add to their knowledge base next."),
});

export type ConversationAnalytics = z.infer<typeof analyticsSchema>;

// Founder request 2026-08-23: the "weekly/monthly AI analytics... trends,
// asks and opportunities" feature promised on the Standard-tier paywall
// card but never actually built (PLANS.md 5.6 explicitly scoped this out
// of DEV-22). Deliberately descriptive, not predictive — PLANS.md's own
// V1 guardrails exclude "advanced predictive analytics," so this only
// ever reports real, counted recurrence in the given conversations, never
// a forecast or a likelihood.
const SYSTEM_PROMPT = `You analyze a business's real customer conversations from the past period to surface actual recurring patterns — never predictions, never speculation, only what genuinely repeats in the conversations given.

Rules:
1. recurring_asks: group similar customer questions/requests together and count real occurrences. Only include something that came up in more than one conversation — a single mention is not a pattern.
2. escalation_themes: group the real reasons conversations needed a human, by recurring theme. Same rule — only real recurrence, not one-off cases.
3. knowledge_gaps: specific things customers asked about that the approved knowledge base (given below) does not cover.
4. Never invent a pattern, a count, or a knowledge gap not actually present in what's given. An empty array is the honest answer when nothing recurs — never pad results to look more substantial than the data supports.`;

export type ConversationInput = {
  qualification: Record<string, string | null> | null;
  escalationReason: string | null;
  customerMessages: string[];
};

export async function generateConversationAnalytics(
  conversations: ConversationInput[],
  approvedKnowledgeSummary: string,
): Promise<ConversationAnalytics | null> {
  if (conversations.length === 0) return { recurring_asks: [], escalation_themes: [], knowledge_gaps: [] };

  const redactedConversations = conversations
    .map((c, i) => {
      const messages = c.customerMessages.map((m) => redactPii(m)).join(" | ");
      const escalation = c.escalationReason ? ` [escalated: ${redactPii(c.escalationReason)}]` : "";
      return `Conversation ${i + 1}: ${messages}${escalation}`;
    })
    .join("\n");

  try {
    const { object } = await generateObject({
      model: MODEL,
      schema: analyticsSchema,
      system: SYSTEM_PROMPT,
      prompt: `Approved knowledge base:\n${approvedKnowledgeSummary}\n\nConversations from this period:\n${redactedConversations.slice(0, 20000)}`,
    });
    return object;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) return null;
    throw error;
  }
}

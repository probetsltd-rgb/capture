import "server-only";
import { PDFParse } from "pdf-parse";
import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";

// Founder request 2026-08-21: a knowledge base is rarely built one item at
// a time from scratch — many businesses already have a brochure or price
// list. This extracts individual, reviewable knowledge items from an
// uploaded document, same category shape as knowledge_items' insertable
// columns (mirrors vertical_templates' knowledge_base_items JSONB shape).
// Deliberately text extraction, not a multi-modal file input to the model
// — the AI Gateway's provider-agnostic string-model routing (AD-3) doesn't
// have a verified, current file-input calling convention in this codebase
// yet, whereas plain-text generateObject is the exact pattern already
// proven throughout (classify.ts, draft-message.ts, engine.ts). Safer to
// reuse a working pattern than gamble on an unverified one for a
// safety-adjacent feature (extracted items still require human review
// before the AI can use them, but a garbled extraction is still a bad
// first impression).
const MODEL = process.env.PREVENT_MODEL || "anthropic/claude-haiku-4.5";

const CATEGORIES = ["product", "faq", "hours", "location", "policy", "delivery", "booking", "other"] as const;

const extractionSchema = z.object({
  items: z
    .array(
      z.object({
        category: z.enum(CATEGORIES),
        content: z
          .string()
          .max(300)
          .describe("One self-contained fact — a single product with its price/variants, one policy, one FAQ answer, etc. Never combine multiple products into one item."),
      }),
    )
    .max(100)
    .describe("Every distinct product, price, policy, or fact found in the document, each as its own item."),
});

const SYSTEM_PROMPT = `You extract structured knowledge-base items from a business's uploaded brochure or price list, for a customer-service AI to later use (once a human reviews and approves each item — nothing you extract is used automatically).

Rules:
1. One item per distinct product, price, policy, or fact — never combine several products into a single item's content, even if the source document lists them together in a table.
2. Only extract what's actually written in the document. Never infer, guess, or add information not present.
3. For products: include the name, price, and any variants (size/color/etc.) mentioned, all in one content string, matching how a real business owner would describe it in conversation.
4. Category is one of: product, faq, hours, location, policy, delivery, booking, other.
5. If the document contains nothing extractable (e.g. a cover page, a logo, blank content), return an empty items array — do not invent content to fill it.`;

export type ExtractedKnowledgeItem = { category: (typeof CATEGORIES)[number]; content: string };

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}

/**
 * Extract candidate knowledge items from raw document text. Returns null
 * (never a guessed/partial result) if the model fails to produce a
 * schema-conformant result — same discipline as classifyConversation.
 */
export async function extractKnowledgeItems(documentText: string): Promise<ExtractedKnowledgeItem[] | null> {
  // A blank/near-blank document (e.g. a scanned-image-only PDF with no
  // extractable text layer) never reaches the model — an empty prompt
  // would just waste a call to produce an empty result anyway.
  if (documentText.trim().length < 20) return [];

  try {
    const { object } = await generateObject({
      model: MODEL,
      schema: extractionSchema,
      system: SYSTEM_PROMPT,
      prompt: `Extract knowledge items from this document:\n\n${documentText.slice(0, 20000)}`,
    });
    return object.items;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) return null;
    throw error;
  }
}

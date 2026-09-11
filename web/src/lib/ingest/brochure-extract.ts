import "server-only";
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
          // Real bug found 2026-09-11 extracting a real business's website
          // (rentit.ng): a genuine FAQ answer ("What happens if the item is
          // damaged...") was 315 chars — over the old 300 cap — which
          // failed Zod validation on the whole response object and
          // silently discarded all 22 other, valid extracted items along
          // with it (generateObject has no partial-success mode; one bad
          // field fails the entire object). 500 gives real prose FAQ
          // answers headroom a brochure's terser lines rarely need.
          .max(500)
          .describe("One self-contained fact — a single product with its price/variants, one policy, one FAQ answer, etc. Never combine multiple products into one item."),
      }),
    )
    .max(100)
    .describe("Every distinct product, price, policy, or fact found in the document, each as its own item."),
});

const DOCUMENT_SYSTEM_PROMPT = `You extract structured knowledge-base items from a business's uploaded brochure or price list, for a customer-service AI to later use (once a human reviews and approves each item — nothing you extract is used automatically).

Rules:
1. One item per distinct product, price, policy, or fact — never combine several products into a single item's content, even if the source document lists them together in a table.
2. Only extract what's actually written in the document. Never infer, guess, or add information not present.
3. For products: include the name, price, and any variants (size/color/etc.) mentioned, all in one content string, matching how a real business owner would describe it in conversation.
4. Category is one of: product, faq, hours, location, policy, delivery, booking, other.
5. If the document contains nothing extractable (e.g. a cover page, a logo, blank content), return an empty items array — do not invent content to fill it.`;

// Founder request 2026-08-21: seed a business's knowledge base from what
// they've already told real customers on Instagram, not from a document.
// A distinct prompt (not the document one above) because real chat replies
// have real chat properties a brochure doesn't: the same fact gets
// restated many times with different wording across conversations
// (needs consolidating into ONE item, not N near-duplicates), and replies
// are full of pleasantries/small talk that carry no extractable fact at
// all (must be ignored, not forced into an item).
const CONVERSATION_SYSTEM_PROMPT = `You extract structured knowledge-base items from a business's own past Instagram replies to real customers, for a customer-service AI to later use (once a human reviews and approves each item — nothing you extract is used automatically).

Rules:
1. Only extract genuine business facts actually stated — hours, prices, policies, product/service details, delivery/booking terms. Ignore greetings, small talk, and anything that isn't a stated fact about the business.
2. The same fact is often restated across several different replies in different words (e.g. hours mentioned three separate times to three different customers) — consolidate these into ONE item, not one per mention.
3. Never infer, guess, or extrapolate beyond what was actually written in a reply. If a reply is ambiguous or incomplete, leave it out rather than guessing what was meant.
4. Category is one of: product, faq, hours, location, policy, delivery, booking, other.
5. If nothing extractable is found, return an empty items array — do not invent content to fill it.`;

export type ExtractedKnowledgeItem = { category: (typeof CATEGORIES)[number]; content: string };

// Founder request 2026-08-26: the conversation-history seed already reads
// every past reply once to extract stated facts — reuse that same reading
// to also surface what was NEVER stated (or stated incompletely) but a real
// customer would ask about, e.g. delivery mentioned with no fee attached,
// or returns/hours never coming up at all. A separate call/schema from
// extractKnowledgeItems above (not a shared union) because this is asking
// questions, not asserting facts — conflating the two schemas would blur
// the "never infer beyond what was written" discipline that governs
// extraction into inventing plausible-sounding gaps instead.
const gapQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        category: z.enum(CATEGORIES),
        question: z.string().max(200).describe("A short, direct question to ask the business owner, in plain language."),
      }),
    )
    .max(5)
    .describe("3-5 questions about real gaps found in the replies. Fewer (even zero) only if there genuinely aren't that many gaps."),
});

const GAP_QUESTIONS_SYSTEM_PROMPT = `You review a business's own past Instagram replies to real customers and identify gaps worth asking the owner about directly, so their knowledge base can be strengthened beyond what customers happened to already ask.

Rules:
1. A gap is something a real customer would plausibly ask about that is either never mentioned in the replies at all, or mentioned incompletely (e.g. delivery is discussed but no fee or area is ever given; a product is named but no price appears anywhere).
2. Never invent or guess an answer yourself — you are only proposing the QUESTION to ask the owner, never a guessed fact.
3. Prefer concrete, answerable questions ("What do you charge for delivery outside Lagos?") over vague ones ("Tell me about delivery.").
4. Category is one of: product, faq, hours, location, policy, delivery, booking, other — pick whichever the answer would belong to.
5. Aim for 3-5 questions covering distinct gaps, not near-duplicates. If the replies genuinely leave few or no real gaps, return fewer questions (or none) rather than padding to 5.`;

/**
 * Propose 3-5 questions about gaps in a business's own past replies —
 * things worth asking the owner directly to strengthen the knowledge base
 * beyond what extractKnowledgeItems already pulled out. Conversation-history
 * seeding only (see seedKnowledgeFromHistory) — not used for brochure
 * uploads, which have no "gap" concept the same way. Returns null (never a
 * guessed/partial result) on model failure, same discipline as
 * extractKnowledgeItems.
 */
export async function extractKnowledgeGapQuestions(
  sourceText: string,
): Promise<{ category: (typeof CATEGORIES)[number]; question: string }[] | null> {
  if (sourceText.trim().length < 20) return [];

  try {
    const { object } = await generateObject({
      model: MODEL,
      schema: gapQuestionsSchema,
      system: GAP_QUESTIONS_SYSTEM_PROMPT,
      prompt: `Here are a business's past customer-service replies. Propose 3-5 questions worth asking the owner to fill real gaps:\n\n${sourceText.slice(0, 20000)}`,
    });
    return object.questions;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) return null;
    throw error;
  }
}

// Lazy/dynamic import, not a top-level one: `pdf-parse` (via `pdfjs-dist`)
// references the browser-only `DOMMatrix` global at module-EVALUATION time,
// not just when actually parsing a PDF. A top-level import here previously
// crashed every /dashboard request with "DOMMatrix is not defined" — nothing
// on that render path ever calls this function, but instagram.ts imports
// extractKnowledgeItems from this same file, and /dashboard/page.tsx
// imports instagram.ts, so the static import still got evaluated as part of
// that shared server bundle. Deferring the import to call time means the
// module is only ever loaded when a brochure is actually being parsed.
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}

/**
 * Extract candidate knowledge items from raw text — either an uploaded
 * document, or a business's own historical conversation replies. Returns
 * null (never a guessed/partial result) if the model fails to produce a
 * schema-conformant result — same discipline as classifyConversation.
 */
export async function extractKnowledgeItems(
  sourceText: string,
  source: "document" | "conversation_history" = "document",
): Promise<ExtractedKnowledgeItem[] | null> {
  // Blank/near-blank input (e.g. a scanned-image-only PDF with no
  // extractable text layer, or a business with zero historical replies)
  // never reaches the model — an empty prompt would just waste a call to
  // produce an empty result anyway.
  if (sourceText.trim().length < 20) return [];

  const isConversationHistory = source === "conversation_history";

  try {
    const { object } = await generateObject({
      model: MODEL,
      schema: extractionSchema,
      system: isConversationHistory ? CONVERSATION_SYSTEM_PROMPT : DOCUMENT_SYSTEM_PROMPT,
      prompt: `Extract knowledge items from ${isConversationHistory ? "these past customer-service replies" : "this document"}:\n\n${sourceText.slice(0, 20000)}`,
    });
    return object.items;
  } catch (error) {
    // This failure mode is otherwise a total black box (2026-09-11: took a
    // real reproduction against a real website to find that a single
    // over-length field discarded 22 otherwise-valid extracted items) —
    // log the actual validation cause so a recurrence shows up in Vercel
    // logs instead of just the generic user-facing message.
    if (NoObjectGeneratedError.isInstance(error)) {
      console.error("extractKnowledgeItems: model output failed schema validation", error.cause);
      return null;
    }
    throw error;
  }
}

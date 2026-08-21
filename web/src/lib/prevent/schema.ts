import { z } from "zod";

// PRD §17C intent examples.
export const INTENTS = [
  "price",
  "product",
  "availability",
  "booking",
  "location",
  "general_information",
  "complaint",
  "human_assistance",
  // Added 2026-08-21 (founder observation): photo/video requests are a
  // distinct, common enough enquiry pattern during product conversations
  // to deserve their own classification rather than being folded into
  // "product" — worth tracking separately for reporting later, and gives
  // escalation_reason something concrete to point at.
  "media_request",
] as const;
export type Intent = (typeof INTENTS)[number];

// Addendum §9 four-tier answerability classification, replacing the
// original binary `can_answer_from_knowledge` gate. Each tier maps to a
// distinct handling path — see `safe-response-gate.ts`'s
// `evaluateSafeResponseGate`, the single auditable function that turns this
// classification (plus the other structured fields below) into the actual
// respond-or-escalate decision. The tier alone is never trusted on its own.
export const ANSWERABILITY_TIERS = ["A", "B", "C", "D"] as const;
export type AnswerabilityTier = (typeof ANSWERABILITY_TIERS)[number];

export const engineResponseSchema = z.object({
  intent: z.enum(INTENTS),
  answerability: z
    .enum(ANSWERABILITY_TIERS)
    .describe(
      "A = known information with sufficient grounding in approved knowledge (opening hours, address, an approved fixed price). " +
        "B = safe but bounded — a comparison, qualification question, or quote that stays strictly within approved knowledge, never extrapolated. " +
        "C = requires human judgement, authority, negotiation, or live information (best-price haggling, complaints, refunds, unusual/high-value requests) — never improvise, always escalate. " +
        "D = cannot confidently determine the answer from approved knowledge — state that confirmation is needed and escalate.",
    ),
  response: z
    .string()
    .max(600)
    .nullable()
    .describe("Only set for tier A or B. Must not include anything not in the provided approved knowledge."),
  // Founder request 2026-08-21: send an attached product photo/video as a
  // native inline Instagram attachment, not a text link the customer has
  // to click out to. Only ever the EXACT media URL copied verbatim from an
  // approved knowledge item — never invented, never guessed, same
  // no-hallucination discipline as `response` itself. Null whenever no
  // approved item has a matching attached media file, even if the topic
  // itself is otherwise answerable.
  media_url: z
    .string()
    .nullable()
    .describe(
      "Set to the exact media URL from approved knowledge ONLY when sharing a photo/video attached to an item being discussed — copied verbatim, never invented. Null otherwise, including when escalating.",
    ),
  escalate: z.boolean(),
  escalation_reason: z
    .string()
    .max(200)
    .nullable()
    .describe("Required when escalate is true — short, e.g. 'customer asked for a discount not in policy'."),
  // PRD §17D: "Only collect genuinely useful information" — every field is
  // independently nullable, extracted only when the customer actually
  // stated it in this message. Never inferred or guessed.
  qualification: z.object({
    name: z.string().max(100).nullable(),
    product_or_service: z.string().max(200).nullable(),
    location: z.string().max(200).nullable(),
    relevant_date: z.string().max(100).nullable(),
    contact_details: z.string().max(200).nullable(),
  }),
});

export type EngineResponse = z.infer<typeof engineResponseSchema>;

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
] as const;

export const engineResponseSchema = z.object({
  intent: z.enum(INTENTS),
  // The model must explicitly declare whether the approved knowledge
  // actually covers this question — this field, not just prompt wording,
  // is the hard constraint. `response` is only trusted when this is true.
  can_answer_from_knowledge: z.boolean(),
  response: z
    .string()
    .max(600)
    .nullable()
    .describe("Only set when can_answer_from_knowledge is true. Must not include anything not in the provided knowledge."),
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

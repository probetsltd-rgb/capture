import { z } from "zod";

// Mirrors the exact enum values in supabase/migrations/20260810000000_init.sql
// (conversations.conversation_type/intent/status/leakage_type CHECK
// constraints) and phase0/conversation_log_template.csv — PRD §9 taxonomy.
// Keeping these in one place means a model output either writes directly to
// the DB or fails Zod validation; there's no silent drift between what the
// LLM can produce and what the schema accepts.

export const classificationSchema = z.object({
  conversation_type: z.enum([
    "sales_enquiry",
    "existing_customer",
    "support",
    "complaint",
    "general",
    "spam_irrelevant",
    "unknown",
  ]),
  intent: z.enum(["high", "medium", "low", "none"]),
  status: z.enum([
    "converted",
    "likely_converted",
    "abandoned",
    "no_response",
    "unresolved",
    "unclear",
  ]),
  leakage_type: z.enum([
    "no_response",
    "delayed_response",
    "abandoned_high_intent",
    "quote_not_followed_up",
    "reactivatable",
    "other",
    "none",
  ]),
  reasoning: z
    .string()
    .max(600)
    .describe("Brief justification (1-2 sentences), stored for audit/debugging — never shown to end users"),
});

export type Classification = z.infer<typeof classificationSchema>;

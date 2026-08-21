import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapWithConcurrency } from "@/lib/concurrency";
import { classifyConversation } from "@/lib/classification/classify";

// Extracted from upload/[token]/actions.ts (2026-08-15) so Instagram's
// historical-fetch ingestion (Phase 5.2) shares the exact same classify +
// opportunity-creation logic as the manual-export path, instead of a
// second copy drifting from it over time — same rationale as pulling
// mapWithConcurrency into lib/concurrency.ts (TESTS.md DEV-7).

const CLASSIFY_CONCURRENCY = 10;

export type CreatedConversation = {
  id: string;
  customerId: string;
  messages: { sender_type: string; body: string | null }[];
};

export async function classifyAndScoreConversations(
  supabase: SupabaseClient,
  businessId: string,
  avgTransactionValue: number | null,
  createdConversations: CreatedConversation[],
): Promise<void> {
  await mapWithConcurrency(createdConversations, CLASSIFY_CONCURRENCY, async (conv) => {
    try {
      const result = await classifyConversation(conv.messages);
      if (!result) return; // leave classified_at null — flagged as unclassified, not guessed

      const { reasoning, ...fields } = result;
      await supabase
        .from("conversations")
        .update({ ...fields, classification_notes: reasoning, classified_at: new Date().toISOString() })
        .eq("id", conv.id);

      if (fields.leakage_type === "none") return;

      // Mirrors supabase/seed_simulated.sql's leakage_type -> opportunity
      // mapping exactly, so real and simulated data behave the same way.
      const opportunityType =
        fields.leakage_type === "no_response"
          ? "unanswered_enquiry"
          : fields.leakage_type === "abandoned_high_intent"
            ? "cold_high_intent"
            : fields.leakage_type === "reactivatable"
              ? "previous_customer_reactivation"
              : "other";
      const valueMultiplier =
        fields.leakage_type === "no_response" || fields.leakage_type === "abandoned_high_intent"
          ? 1
          : fields.leakage_type === "quote_not_followed_up"
            ? 0.8
            : fields.leakage_type === "reactivatable"
              ? 0.6
              : fields.leakage_type === "delayed_response"
                ? 0.5
                : null;
      const estimatedValue =
        valueMultiplier !== null && avgTransactionValue !== null ? avgTransactionValue * valueMultiplier : null;

      await supabase.from("opportunities").insert({
        business_id: businessId,
        customer_id: conv.customerId,
        source_conversation_id: conv.id,
        type: opportunityType,
        intent: fields.intent,
        status: "identified",
        estimated_value: estimatedValue,
      });
    } catch (err) {
      // Swallow here, not upstream: one conversation's failure (e.g. a
      // transient rate limit) must not stop the rest of the batch from
      // classifying. Left with classified_at null — visibly unclassified
      // rather than silently wrong.
      console.error(`Classification failed for conversation ${conv.id}:`, err);
    }
  });
}

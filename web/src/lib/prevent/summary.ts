// Pure aggregation over conversations, shared by admin/prevent/[businessId]
// and the Phase 4 self-serve /dashboard. "Answered" needs a join against
// messages that isn't cheap to redo per call, so callers pass in the set of
// conversation IDs that have at least one AI message rather than raw rows.

export type ConversationForSummary = {
  id: string;
  escalated_at: string | null;
  qualification: Record<string, unknown> | null;
  ai_followup_count: number | null;
};

export type PreventSummary = {
  enquiriesReceived: number;
  enquiriesAnswered: number;
  qualifiedLeads: number;
  humanHandoffs: number;
  followUpsSent: number;
};

export function computePreventSummary(
  conversations: ConversationForSummary[],
  answeredConversationIds: Set<string>,
): PreventSummary {
  const enquiriesReceived = conversations.length;
  const enquiriesAnswered = conversations.filter((c) => answeredConversationIds.has(c.id)).length;
  const humanHandoffs = conversations.filter((c) => c.escalated_at !== null).length;
  const qualifiedLeads = conversations.filter(
    (c) => c.qualification && Object.keys(c.qualification).length > 0,
  ).length;
  const followUpsSent = conversations.reduce((sum, c) => sum + (c.ai_followup_count ?? 0), 0);
  return { enquiriesReceived, enquiriesAnswered, qualifiedLeads, humanHandoffs, followUpsSent };
}

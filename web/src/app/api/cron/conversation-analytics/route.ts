import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { generateConversationAnalytics, type ConversationInput } from "@/lib/analytics/generate-conversation-analytics";

// Founder request 2026-08-23: weekly conversation analytics, gated on
// plans.has_analytics — the Standard-tier feature promised on the paywall
// comparison table since DEV-22 but never actually generated until now.
// Same CRON_SECRET auth pattern as api/cron/escalation-timers. Weekly is
// well within Vercel Hobby's once-per-day cron ceiling (unlike the 10-
// minute escalation timer, which isn't).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data: analyticsPlans } = await supabase.from("plans").select("id").eq("has_analytics", true);
  const analyticsPlanIds = (analyticsPlans ?? []).map((p) => p.id);
  if (analyticsPlanIds.length === 0) return Response.json({ businessesProcessed: 0, reason: "no plan has analytics enabled" });

  // Active paying businesses only — has_analytics gates who's entitled,
  // plan_status="active" gates whether a real model call gets spent
  // generating something for a trial that hasn't converted.
  const { data: businesses } = await supabase
    .from("businesses")
    .select("id")
    .eq("plan_status", "active")
    .in("plan_id", analyticsPlanIds);

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  let processed = 0;
  const errors: string[] = [];
  for (const business of businesses ?? []) {
    try {
      const generated = await generateForBusiness(supabase, business.id, periodStart, periodEnd);
      if (generated) processed++;
    } catch (err) {
      // One business's failure must not stop the rest of the batch — same
      // isolation discipline as the historical-fetch/classify loops.
      console.error(`Conversation analytics failed for business ${business.id}`, err);
      errors.push(business.id);
    }
  }

  return Response.json({ businessesEligible: businesses?.length ?? 0, businessesProcessed: processed, errors });
}

async function generateForBusiness(
  supabase: ReturnType<typeof createServiceRoleClient>,
  businessId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<boolean> {
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, qualification, escalation_reason")
    .eq("business_id", businessId)
    // Audit finding 2026-09-27: was instagram_api only, silently generating
    // zero weekly analytics — every week, no error surfaced — for any
    // paying business connected via WhatsApp or Facebook alone. Matches
    // the source filter already fixed in dashboard/page.tsx, admin/page.tsx,
    // and EngageDashboardView.tsx for the same reason.
    .in("source", ["instagram_api", "whatsapp_api", "facebook_api"])
    .gte("last_message_at", periodStart.toISOString())
    .lte("last_message_at", periodEnd.toISOString());

  if (!conversations || conversations.length === 0) return false;

  const conversationIds = conversations.map((c) => c.id);
  const { data: messages } = await supabase
    .from("messages")
    .select("conversation_id, body")
    .in("conversation_id", conversationIds)
    .eq("sender_type", "customer");

  const messagesByConversation = new Map<string, string[]>();
  for (const m of messages ?? []) {
    if (!m.body) continue;
    const list = messagesByConversation.get(m.conversation_id) ?? [];
    list.push(m.body);
    messagesByConversation.set(m.conversation_id, list);
  }

  // Same "only approved knowledge" discipline as everywhere else in
  // Engage — the knowledge_gaps output is only meaningful measured
  // against what the business has actually confirmed, not draft/unapproved
  // suggestions.
  const { data: knowledge } = await supabase
    .from("knowledge_items")
    .select("category, content")
    .eq("business_id", businessId)
    .not("approved_at", "is", null);
  const knowledgeSummary =
    (knowledge ?? []).map((k) => `[${k.category}] ${k.content}`).join("\n") || "(no approved knowledge yet)";

  const input: ConversationInput[] = conversations.map((c) => ({
    qualification: c.qualification as Record<string, string | null> | null,
    escalationReason: c.escalation_reason,
    customerMessages: messagesByConversation.get(c.id) ?? [],
  }));

  const result = await generateConversationAnalytics(input, knowledgeSummary);
  if (!result) return false;

  await supabase.from("conversation_analytics").upsert(
    {
      business_id: businessId,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      conversation_count: conversations.length,
      recurring_asks: result.recurring_asks,
      escalation_themes: result.escalation_themes,
      knowledge_gaps: result.knowledge_gaps,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "business_id,period_start" },
  );
  return true;
}

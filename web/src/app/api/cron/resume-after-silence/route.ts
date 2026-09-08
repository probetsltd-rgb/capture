import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { computeConversationsToResume } from "@/lib/prevent/timers";
import { resumeSilentConversation } from "@/lib/prevent/process";

// Founder decision 2026-09-07 (see lib/prevent/process.ts's top-of-file
// note and lib/prevent/timers.ts's RESUME_AFTER_SILENCE_MINUTES): resumes
// Engage on a human_handling conversation whose latest message is from the
// customer and has sat unanswered past the threshold. Same CRON_SECRET
// auth pattern, and the same Vercel Hobby-plan once-a-day scheduling
// ceiling (OUTSTANDINGS.md DEP-10), as escalation-timers — registered here
// at the same */10 cadence in vercel.json for when that's lifted, not
// because it's guaranteed to actually fire that often today.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("id, business_id")
    .eq("state", "human_handling");

  if (error) return Response.json({ error: "Could not load conversations" }, { status: 500 });
  if (!conversations || conversations.length === 0) {
    return Response.json({ checked: 0, resumed: 0 });
  }

  const conversationIds = conversations.map((c) => c.id);
  // Latest message per conversation, batched rather than per-row — same
  // scale discipline as EngageDashboardView's messagesByConversation.
  const { data: messages } = await supabase
    .from("messages")
    .select("conversation_id, sender_type, sent_at")
    .in("conversation_id", conversationIds)
    .order("sent_at", { ascending: false });

  const latestByConversation = new Map<string, { sender_type: string; sent_at: string }>();
  for (const m of messages ?? []) {
    if (!latestByConversation.has(m.conversation_id)) {
      latestByConversation.set(m.conversation_id, { sender_type: m.sender_type, sent_at: m.sent_at });
    }
  }

  const toResume = new Set(
    computeConversationsToResume(
      conversations.map((c) => ({
        id: c.id,
        latestMessageSenderType: latestByConversation.get(c.id)?.sender_type ?? null,
        latestMessageSentAt: latestByConversation.get(c.id)?.sent_at ?? null,
      })),
    ),
  );

  const results = [];
  for (const conv of conversations) {
    if (!toResume.has(conv.id)) continue;
    const result = await resumeSilentConversation(supabase, conv.business_id, conv.id);
    results.push({ conversationId: conv.id, result });
  }

  return Response.json({ checked: conversations.length, resumed: results.length, results });
}

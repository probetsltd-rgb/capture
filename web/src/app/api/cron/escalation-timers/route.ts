import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { computeDueTimerActions } from "@/lib/prevent/timers";

// PRD §22 escalation timers (T+10 reminder, T+30 manager escalation).
// Secured per Vercel's documented pattern: CRON_SECRET compared against the
// Authorization header Vercel automatically sends. See OUTSTANDINGS.md —
// Vercel Cron on the Hobby plan only runs once/day, far too coarse for a
// 10-minute timer; this route is correct and independently tested, but
// won't run on its intended cadence without a paid plan.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("id, escalated_at, human_taken_at, t10_reminder_sent_at, t30_escalated_at")
    .eq("state", "human_required")
    .is("human_taken_at", null);

  if (error) return Response.json({ error: "Could not load conversations" }, { status: 500 });

  const actions = computeDueTimerActions(conversations ?? []);

  for (const action of actions) {
    const column = action.action === "t10_reminder" ? "t10_reminder_sent_at" : "t30_escalated_at";
    await supabase.from("conversations").update({ [column]: new Date().toISOString() }).eq("id", action.conversationId);
  }

  return Response.json({ checked: conversations?.length ?? 0, actionsApplied: actions.length, actions });
}

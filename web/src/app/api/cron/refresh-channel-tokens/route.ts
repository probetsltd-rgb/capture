import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { decryptToken, encryptToken } from "@/lib/channels/token-crypto";
import { refreshLongLivedToken } from "@/lib/channels/instagram-api";
import { refreshBusinessToken } from "@/lib/channels/whatsapp-api";

// Founder decision 2026-09-08: closes a real gap found while building
// WhatsApp ingestion — Instagram's long-lived token has always expired in
// 60 days (`channel_connections.token_expires_at` is set at connect time)
// with nothing ever refreshing it, and WhatsApp's own 60-day-token
// Embedded Signup configuration (the only one that actually grants
// messaging access) has the identical shape. Both refresh
// server-to-server with no re-authorization from the connected business —
// confirmed against each platform's current docs (Instagram:
// grant_type=ig_refresh_token, must be 24h+ old and not yet expired;
// WhatsApp: grant_type=fb_exchange_token with
// set_token_expires_in_60_days=true, no minimum-age constraint documented).
// Runs daily (well within Vercel Hobby's once-a-day ceiling — unlike
// escalation-timers/handler-reminders, this isn't blocked by DEP-10),
// refreshing anything within 7 days of expiry so a slow day or a transient
// failure still leaves days of runway before an actual outage.
const REFRESH_WINDOW_DAYS = 7;
const MIN_INSTAGRAM_TOKEN_AGE_HOURS = 24;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const refreshBefore = new Date(Date.now() + REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Facebook connections (added OUTSTANDINGS.md "Channel roadmap confirmed
  // 2026-09-08") are saved with token_expires_at: null — Page Access
  // Tokens derived from a long-lived User token carry no documented
  // expiration (facebook.ts's saveFacebookConnection comment) — so this
  // `not(token_expires_at, is, null)` filter already excludes them here,
  // same as any other no-refresh-mechanism connection type.
  const { data: connections, error } = await supabase
    .from("channel_connections")
    .select("id, channel, access_token_encrypted, token_expires_at, updated_at")
    .is("disconnected_at", null)
    .not("token_expires_at", "is", null)
    .lte("token_expires_at", refreshBefore);

  if (error) return Response.json({ error: "Could not load connections" }, { status: 500 });
  if (!connections || connections.length === 0) return Response.json({ checked: 0, refreshed: 0 });

  const results = [];
  for (const conn of connections) {
    try {
      const currentToken = decryptToken(conn.access_token_encrypted);
      let newToken: string;
      let newExpiresInSeconds: number | null;

      if (conn.channel === "instagram") {
        const ageHours = (Date.now() - new Date(conn.updated_at).getTime()) / (60 * 60 * 1000);
        if (ageHours < MIN_INSTAGRAM_TOKEN_AGE_HOURS) {
          results.push({ id: conn.id, channel: conn.channel, skipped: "too_recent" });
          continue;
        }
        const refreshed = await refreshLongLivedToken(currentToken);
        newToken = refreshed.access_token;
        newExpiresInSeconds = refreshed.expires_in;
      } else if (conn.channel === "whatsapp") {
        const refreshed = await refreshBusinessToken(currentToken);
        newToken = refreshed.accessToken;
        newExpiresInSeconds = refreshed.expiresInSeconds;
      } else {
        continue; // no refresh mechanism for other channels
      }

      const newExpiresAt = newExpiresInSeconds
        ? new Date(Date.now() + newExpiresInSeconds * 1000).toISOString()
        : null;
      await supabase
        .from("channel_connections")
        .update({ access_token_encrypted: encryptToken(newToken), token_expires_at: newExpiresAt })
        .eq("id", conn.id);
      results.push({ id: conn.id, channel: conn.channel, refreshed: true });
    } catch (err) {
      // One connection's failure must not stop the rest of the batch —
      // same isolation discipline as every other per-row loop in this
      // codebase (historical fetch, escalation timers). Left un-refreshed
      // here, it stays in the query's window and is retried on the next
      // daily run.
      console.error(`Token refresh failed for channel_connections.id=${conn.id}`, err);
      results.push({ id: conn.id, channel: conn.channel, error: String(err) });
    }
  }

  return Response.json({ checked: connections.length, refreshed: results.filter((r) => "refreshed" in r).length, results });
}

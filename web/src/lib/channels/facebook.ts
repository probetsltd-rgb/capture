import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { encryptToken, decryptToken } from "./token-crypto";
import { notifyChannelConnectionChange } from "@/lib/notifications/channel-connection";

// Mirrors whatsapp.ts's discipline: channel_connections has zero RLS
// policies for `authenticated` (see that migration's header comment) — all
// reads/writes go through the service-role client here, and every caller
// must have already verified session/business ownership itself.
//
// No historical-message baseline here, same real gap as WhatsApp
// (whatsapp.ts's own comment) — Meta's Page Conversations API does expose
// past messages, but this v1 deliberately matches WhatsApp's scope
// (real-time ingestion only, connect-time forward) rather than adding a
// third distinct historical-fetch implementation on day one; a baseline
// import can follow later the same way it could for WhatsApp.

export type FacebookConnectionStatus =
  | { connected: false }
  | { connected: true; pageName: string | null; connectedAt: string };

export async function getFacebookConnectionStatus(businessId: string): Promise<FacebookConnectionStatus> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("channel_connections")
    .select("username, connected_at")
    .eq("business_id", businessId)
    .eq("channel", "facebook")
    .is("disconnected_at", null)
    .maybeSingle();

  if (!data) return { connected: false };
  return { connected: true, pageName: data.username, connectedAt: data.connected_at };
}

export async function disconnectFacebook(businessId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  const { data: existing } = await supabase
    .from("channel_connections")
    .select("username")
    .eq("business_id", businessId)
    .eq("channel", "facebook")
    .is("disconnected_at", null)
    .maybeSingle();

  await supabase
    .from("channel_connections")
    .update({ disconnected_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("channel", "facebook")
    .is("disconnected_at", null);

  await notifyChannelConnectionChange({ businessId, channel: "facebook", action: "disconnected", username: existing?.username ?? null });
}

// Called by the OAuth callback route once the Facebook Login for Business
// flow completes and a Page has been chosen. Page Access Tokens derived
// from a long-lived User token carry no documented expiration (see
// facebook-api.ts's exchangeForLongLivedUserToken comment) — stored as
// token_expires_at: null, same as a connection type with no refresh
// mechanism (api/cron/refresh-channel-tokens already skips null-expiry
// rows). Not treated as literally permanent, only as "no defined expiry":
// Meta can still invalidate it (password change, revoked permission,
// extended inactivity) same as any User-token-derived credential — a real,
// stated limitation, not a guarantee.
export async function saveFacebookConnection(params: {
  businessId: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
}): Promise<void> {
  const supabase = createServiceRoleClient();

  await supabase
    .from("channel_connections")
    .update({ disconnected_at: new Date().toISOString() })
    .eq("business_id", params.businessId)
    .eq("channel", "facebook")
    .is("disconnected_at", null);

  const { error } = await supabase.from("channel_connections").insert({
    business_id: params.businessId,
    channel: "facebook",
    external_account_id: params.pageId,
    username: params.pageName,
    access_token_encrypted: encryptToken(params.pageAccessToken),
    token_expires_at: null,
  });
  if (error) throw new Error(`Failed to save Facebook connection: ${error.message}`);

  await notifyChannelConnectionChange({ businessId: params.businessId, channel: "facebook", action: "connected", username: params.pageName });
}

export async function getConnectionByPageId(
  pageId: string,
): Promise<{ businessId: string; accessToken: string } | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("channel_connections")
    .select("business_id, access_token_encrypted")
    .eq("channel", "facebook")
    .eq("external_account_id", pageId)
    .is("disconnected_at", null)
    .maybeSingle();

  if (!data) return null;
  return { businessId: data.business_id, accessToken: decryptToken(data.access_token_encrypted) };
}

// Real-time webhooks only give the sender's Page-scoped id (PSID), no
// display name — same deliberate gap Instagram's own real-time webhook has
// (findOrCreateConversationForInboundMessage in instagram.ts), for the same
// reason: profile enrichment needs an extra Graph API call not yet verified
// against for this channel, and getting the live loop working safely
// matters more right now. One conversation thread per customer, same
// assumption as every other channel.
export async function findOrCreateConversationForInboundMessage(
  businessId: string,
  psid: string,
): Promise<{ conversationId: string; customerId: string }> {
  const supabase = createServiceRoleClient();

  let customerId: string;
  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("business_id", businessId)
    .eq("external_customer_id", psid)
    .maybeSingle();

  if (existingCustomer) {
    customerId = existingCustomer.id;
  } else {
    const { data: newCustomer, error } = await supabase
      .from("customers")
      .insert({ business_id: businessId, external_customer_id: psid, source: "facebook_api" })
      .select("id")
      .single();
    if (error || !newCustomer) throw new Error(`Failed to create customer: ${error?.message}`);
    customerId = newCustomer.id;
  }

  const { data: existingConversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .eq("channel", "facebook")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (existingConversation) {
    return { conversationId: existingConversation.id, customerId };
  }

  const { data: newConversation, error: conversationError } = await supabase
    .from("conversations")
    .insert({
      business_id: businessId,
      customer_id: customerId,
      channel: "facebook",
      source: "facebook_api",
      state: "new",
      first_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (conversationError || !newConversation) {
    throw new Error(`Failed to create conversation: ${conversationError?.message}`);
  }
  return { conversationId: newConversation.id, customerId };
}

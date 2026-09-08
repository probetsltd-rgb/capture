import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { encryptToken, decryptToken } from "./token-crypto";

// Mirrors instagram.ts's discipline: channel_connections has zero RLS
// policies for `authenticated` (see that migration's header comment) — all
// reads/writes go through the service-role client here, and every caller
// must have already verified session/business ownership itself.

export type WhatsAppConnectionStatus =
  | { connected: false; canReconnect: boolean; phoneNumber: string | null }
  | { connected: true; phoneNumber: string | null; connectedAt: string };

export async function getWhatsAppConnectionStatus(businessId: string): Promise<WhatsAppConnectionStatus> {
  const supabase = createServiceRoleClient();
  const { data: active } = await supabase
    .from("channel_connections")
    .select("username, connected_at")
    .eq("business_id", businessId)
    .eq("channel", "whatsapp")
    .is("disconnected_at", null)
    .maybeSingle();

  if (active) {
    // `username` doubles as the connected business's display phone number
    // here — no WhatsApp-specific column needed for one string, same
    // reuse-don't-duplicate reasoning as external_account_id doubling as
    // phone_number_id (see the migration's comment).
    return { connected: true, phoneNumber: active.username, connectedAt: active.connected_at };
  }

  // Founder-caught 2026-09-08: disconnecting then re-running Embedded
  // Signup for the SAME number failed silently on Meta's side — that flow
  // is built for onboarding a fresh WABA, not re-adding one that already
  // has a working System User token behind it (this project's own
  // disconnect, like Instagram's, never revokes anything on Meta's side —
  // see disconnectWhatsApp below). A soft-disconnected row's token is
  // still perfectly valid, so surfacing it here lets the dashboard offer a
  // real "Reconnect" that just restores the row (reconnectWhatsApp below)
  // instead of sending the business back through a flow that doesn't
  // handle this case.
  const { data: previous } = await supabase
    .from("channel_connections")
    .select("username")
    .eq("business_id", businessId)
    .eq("channel", "whatsapp")
    .not("disconnected_at", "is", null)
    .order("disconnected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { connected: false, canReconnect: !!previous, phoneNumber: previous?.username ?? null };
}

export async function disconnectWhatsApp(businessId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("channel_connections")
    .update({ disconnected_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("channel", "whatsapp")
    .is("disconnected_at", null);
}

// Restores the most recently soft-disconnected connection without going
// back through Embedded Signup — see getWhatsAppConnectionStatus's comment
// for why that flow doesn't reliably handle re-adding an already-
// provisioned number. Re-verifies the token against Meta's own
// debug_token endpoint first: a soft-disconnected row's token could
// separately have been revoked (e.g. removed from the System User in
// Meta Business Settings), and silently restoring a dead connection would
// just move the failure from "reconnect" to "the next real message."
export async function reconnectWhatsApp(businessId: string): Promise<{ ok: boolean; message: string }> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("channel_connections")
    .select("id, access_token_encrypted")
    .eq("business_id", businessId)
    .eq("channel", "whatsapp")
    .not("disconnected_at", "is", null)
    .order("disconnected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { ok: false, message: "No previous WhatsApp connection to restore — use Connect WhatsApp instead." };

  const accessToken = decryptToken(data.access_token_encrypted);
  const debugResponse = await fetch(
    `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${accessToken}`,
  );
  const debug = await debugResponse.json();
  if (!debug?.data?.is_valid) {
    return { ok: false, message: "That connection is no longer valid on Meta's side — use Connect WhatsApp to set up a new one." };
  }

  await supabase.from("channel_connections").update({ disconnected_at: null }).eq("id", data.id);
  return { ok: true, message: "WhatsApp reconnected." };
}

// Called by the Embedded Signup callback route once a business completes
// the hosted flow. No historical-message baseline here unlike Instagram's
// saveInstagramConnection/fetchHistoricalMessages — the Cloud API has no
// endpoint to list a WhatsApp number's past conversations (WhatsApp simply
// doesn't expose message history the way Instagram's Conversations API
// does); ingestion starts from the moment the webhook is subscribed
// forward, not before. A real, permanent capability gap, not a
// not-built-yet one — worth stating plainly rather than a TODO that
// implies otherwise.
export async function saveWhatsAppConnection(params: {
  businessId: string;
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber: string | null;
  accessToken: string;
  expiresInSeconds: number | null;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const tokenExpiresAt = params.expiresInSeconds
    ? new Date(Date.now() + params.expiresInSeconds * 1000).toISOString()
    : null;

  await supabase
    .from("channel_connections")
    .update({ disconnected_at: new Date().toISOString() })
    .eq("business_id", params.businessId)
    .eq("channel", "whatsapp")
    .is("disconnected_at", null);

  const { error } = await supabase.from("channel_connections").insert({
    business_id: params.businessId,
    channel: "whatsapp",
    external_account_id: params.phoneNumberId,
    waba_id: params.wabaId,
    username: params.displayPhoneNumber,
    access_token_encrypted: encryptToken(params.accessToken),
    token_expires_at: tokenExpiresAt,
  });
  if (error) throw new Error(`Failed to save WhatsApp connection: ${error.message}`);
}

export async function getConnectionByPhoneNumberId(
  phoneNumberId: string,
): Promise<{ businessId: string; accessToken: string } | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("channel_connections")
    .select("business_id, access_token_encrypted")
    .eq("channel", "whatsapp")
    .eq("external_account_id", phoneNumberId)
    .is("disconnected_at", null)
    .maybeSingle();

  if (!data) return null;
  return { businessId: data.business_id, accessToken: decryptToken(data.access_token_encrypted) };
}

// For founder-facing tooling (message template creation) keyed by
// businessId rather than phoneNumberId — the inbound direction above.
export async function getWhatsAppConnectionForBusiness(
  businessId: string,
): Promise<{ accessToken: string; wabaId: string; phoneNumber: string | null } | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("channel_connections")
    .select("access_token_encrypted, waba_id, username")
    .eq("business_id", businessId)
    .eq("channel", "whatsapp")
    .is("disconnected_at", null)
    .maybeSingle();

  if (!data || !data.waba_id) return null;
  return { accessToken: decryptToken(data.access_token_encrypted), wabaId: data.waba_id, phoneNumber: data.username };
}

// Unlike Instagram's equivalent (findOrCreateConversationForInboundMessage
// in instagram.ts), a WhatsApp webhook payload's `contacts[].profile.name`
// gives a real display name on the very first message — closing the exact
// gap logged for Instagram (OUTSTANDINGS.md: real-time webhooks there only
// give a numeric id, no username, "a deliberate gap, not an oversight").
// One conversation thread per customer, same assumption as Instagram.
export async function findOrCreateConversationForInboundMessage(
  businessId: string,
  waId: string,
  profileName: string | null,
): Promise<{ conversationId: string; customerId: string }> {
  const supabase = createServiceRoleClient();

  let customerId: string;
  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("business_id", businessId)
    .eq("external_customer_id", waId)
    .maybeSingle();

  if (existingCustomer) {
    customerId = existingCustomer.id;
  } else {
    const { data: newCustomer, error } = await supabase
      .from("customers")
      .insert({ business_id: businessId, external_customer_id: waId, name: profileName, source: "whatsapp_api" })
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
    .eq("channel", "whatsapp")
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
      channel: "whatsapp",
      source: "whatsapp_api",
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

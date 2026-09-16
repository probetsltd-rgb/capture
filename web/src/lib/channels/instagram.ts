import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { encryptToken, decryptToken } from "./token-crypto";
import { fetchConversationList, fetchConversationMessages } from "./instagram-api";
import { classifyAndScoreConversations, type CreatedConversation } from "@/lib/ingest/classify-and-score";
import { extractKnowledgeItems, extractKnowledgeGapQuestions } from "@/lib/ingest/brochure-extract";
import { redactPii } from "@/lib/classification/redact";
import { notifyChannelConnectionChange } from "@/lib/notifications/channel-connection";

// channel_connections has zero RLS policies for `authenticated` — see the
// migration's header comment. All reads/writes go through the service-role
// client from here, and every caller into this module must have already
// verified (via getOwnBusinessId or equivalent) that the current session
// actually owns businessId before calling — this module does not
// re-verify session/ownership itself, matching the discipline used
// elsewhere for service-role reads gated on an already-checked businessId.

export type InstagramConnectionStatus =
  | { connected: false }
  | { connected: true; username: string | null; connectedAt: string };

export async function getInstagramConnectionStatus(
  businessId: string,
): Promise<InstagramConnectionStatus> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("channel_connections")
    .select("username, connected_at")
    .eq("business_id", businessId)
    .eq("channel", "instagram")
    .is("disconnected_at", null)
    .maybeSingle();

  if (!data) return { connected: false };
  return { connected: true, username: data.username, connectedAt: data.connected_at };
}

export async function disconnectInstagram(businessId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  // Read the username back before closing the row out — the update below
  // doesn't return it, and the notification wants it for the email body.
  const { data: existing } = await supabase
    .from("channel_connections")
    .select("username")
    .eq("business_id", businessId)
    .eq("channel", "instagram")
    .is("disconnected_at", null)
    .maybeSingle();

  await supabase
    .from("channel_connections")
    .update({ disconnected_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("channel", "instagram")
    .is("disconnected_at", null);

  await notifyChannelConnectionChange({ businessId, channel: "instagram", action: "disconnected", username: existing?.username ?? null });
}

// Meta's Data Deletion Instructions requirement (META_APP_REVIEW.md §5) —
// distinct from disconnectInstagram() above, which only soft-marks a
// connection inactive and is fully reversible via reconnect. This
// hard-deletes everything obtained via the Instagram API for this business:
// the stored (encrypted) access token, and every customer/conversation/
// message sourced through it. Scoped to `source = 'instagram_api'`
// specifically, not `channel = 'instagram'` broadly, so a business's own
// manually-uploaded Instagram export data (Find's older, separate intake
// path, different consent basis — see PLANS.md 1.4a) is never touched by an
// Instagram-API deletion request.
//
// Deleting `customers` is the only explicit delete needed beyond
// `channel_connections` — every other row cascades from it by design, not
// by accident (verified against the actual migrations, not assumed):
// `conversations.customer_id references customers(id) on delete cascade`,
// `messages.conversation_id references conversations(id) on delete
// cascade`, and `opportunities.customer_id references customers(id) on
// delete cascade` (which itself cascades into `automations`). An
// opportunity's `source_conversation_id` uses `on delete set null` instead
// of cascade, but that's irrelevant here since the row is being deleted via
// the customer_id cascade regardless.
export async function deleteInstagramData(
  businessId: string,
  actorUserId: string,
): Promise<{ customersDeleted: number; connectionDeleted: boolean }> {
  const supabase = createServiceRoleClient();

  const { data: deletedCustomers } = await supabase
    .from("customers")
    .delete()
    .eq("business_id", businessId)
    .eq("source", "instagram_api")
    .select("id");

  const { data: deletedConnections } = await supabase
    .from("channel_connections")
    .delete()
    .eq("business_id", businessId)
    .eq("channel", "instagram")
    .select("id, username");

  if (deletedConnections && deletedConnections.length > 0) {
    await notifyChannelConnectionChange({
      businessId,
      channel: "instagram",
      action: "disconnected",
      username: deletedConnections[0].username ?? null,
    });
  }

  const result = {
    customersDeleted: deletedCustomers?.length ?? 0,
    connectionDeleted: (deletedConnections?.length ?? 0) > 0,
  };

  // audit_log is append-only (Cross-Cutting Security Workstream), and this
  // is the first real write into it — a genuine compliance-relevant event
  // is exactly what it was built for.
  await supabase.from("audit_log").insert({
    business_id: businessId,
    actor_user_id: actorUserId,
    action: "data_deletion",
    resource_type: "instagram_api_data",
    metadata: result,
  });

  return result;
}

// Distinct from deleteInstagramData() above: that one is Meta's Data
// Deletion Instructions requirement and deliberately also disconnects, per
// what a genuine deletion request should do. This is a narrower operational
// tool — clear conversation history (e.g. before recording a product demo)
// without disconnecting Instagram, since a fresh historical re-fetch would
// just re-pull the same real messages back from Instagram's own servers
// anyway (they're not deleted there, only our copy is). Same cascade
// discipline as deleteInstagramData: deleting `customers` is the only
// explicit delete needed, everything else cascades.
export async function resetInstagramConversationHistory(
  businessId: string,
  actorUserId: string,
): Promise<{ customersDeleted: number }> {
  const supabase = createServiceRoleClient();

  const { data: deletedCustomers } = await supabase
    .from("customers")
    .delete()
    .eq("business_id", businessId)
    .eq("source", "instagram_api")
    .select("id");

  const result = { customersDeleted: deletedCustomers?.length ?? 0 };

  await supabase.from("audit_log").insert({
    business_id: businessId,
    actor_user_id: actorUserId,
    action: "conversation_history_reset",
    resource_type: "instagram_api_data",
    metadata: result,
  });

  return result;
}

export async function saveInstagramConnection(params: {
  businessId: string;
  externalAccountId: string;
  username: string | null;
  accessToken: string;
  expiresInSeconds: number;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const tokenExpiresAt = new Date(Date.now() + params.expiresInSeconds * 1000).toISOString();

  // Reconnecting replaces the previous active row rather than accumulating
  // duplicates — see the unique index in the migration. Explicitly close
  // out any existing active row first so a stale one never lingers if the
  // upsert's conflict target ever changes.
  await supabase
    .from("channel_connections")
    .update({ disconnected_at: new Date().toISOString() })
    .eq("business_id", params.businessId)
    .eq("channel", "instagram")
    .is("disconnected_at", null);

  const { error } = await supabase.from("channel_connections").insert({
    business_id: params.businessId,
    channel: "instagram",
    external_account_id: params.externalAccountId,
    username: params.username,
    access_token_encrypted: encryptToken(params.accessToken),
    token_expires_at: tokenExpiresAt,
  });

  if (error) throw new Error(`Failed to save Instagram connection: ${error.message}`);

  await notifyChannelConnectionChange({
    businessId: params.businessId,
    channel: "instagram",
    action: "connected",
    username: params.username,
  });
}

// PLANS.md Phase 5.2 — 30-day baseline (Capture_PRD_Addendum_v2.md §16).
// One-time snapshot at connect time, not an ongoing incremental sync —
// ongoing new messages are the live webhook's job (next Phase 5.2 item,
// not built yet). Deliberately skips conversations that already exist
// (via external_conversation_id) rather than attempting to merge new
// messages into them, so this is safe to re-trigger on reconnect without
// duplicating data, but re-running it will not backfill messages that
// arrived in an already-imported conversation since the last run.
const BASELINE_WINDOW_DAYS = 30;
const MAX_CONVERSATIONS = 250; // matches MAX_CONVERSATIONS_PER_UPLOAD's Vercel-duration-budget reasoning
const MAX_MESSAGES_PER_CONVERSATION = 500;

export async function fetchHistoricalMessages(businessId: string): Promise<{ conversationsImported: number }> {
  const supabase = createServiceRoleClient();

  const { data: connection } = await supabase
    .from("channel_connections")
    .select("access_token_encrypted, external_account_id")
    .eq("business_id", businessId)
    .eq("channel", "instagram")
    .is("disconnected_at", null)
    .maybeSingle();

  if (!connection) throw new Error("No active Instagram connection for this business");

  const { data: business } = await supabase
    .from("businesses")
    .select("avg_transaction_value, knowledge_base_seeded_at")
    .eq("id", businessId)
    .maybeSingle();

  const accessToken = decryptToken(connection.access_token_encrypted);
  const businessAccountId = connection.external_account_id;

  const stopBefore = new Date(Date.now() - BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const conversations = await fetchConversationList(accessToken, businessAccountId, stopBefore, MAX_CONVERSATIONS);

  const createdConversations: CreatedConversation[] = [];

  for (const conv of conversations) {
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("business_id", businessId)
      .eq("external_conversation_id", conv.id)
      .maybeSingle();
    if (existing) continue; // already imported — see the module-level note above

    const messages = await fetchConversationMessages(accessToken, conv.id, MAX_MESSAGES_PER_CONVERSATION);
    if (messages.length === 0) continue;

    // The business's own IG-scoped id is known (channel_connections), so
    // the business/customer split is exact — unlike the manual-export
    // parsers, which have to guess it from a name recurring across files.
    const customerMessage = messages.find((m) => m.from.id !== businessAccountId);
    const businessMessage = messages.find((m) => m.from.id === businessAccountId);
    const customerParty = customerMessage
      ? customerMessage.from
      : businessMessage?.to.data.find((p) => p.id !== businessAccountId);
    if (!customerParty) continue; // no identifiable other party — skip rather than guess

    let customerId: string;
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("business_id", businessId)
      .eq("external_customer_id", customerParty.id)
      .maybeSingle();

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const { data: newCustomer, error: customerError } = await supabase
        .from("customers")
        .insert({
          business_id: businessId,
          name: customerParty.username,
          handle: customerParty.username,
          external_customer_id: customerParty.id,
          source: "instagram_api",
        })
        .select("id")
        .single();
      if (customerError || !newCustomer) continue;
      customerId = newCustomer.id;
    }

    const sorted = [...messages].sort(
      (a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime(),
    );

    const { data: newConversation, error: conversationError } = await supabase
      .from("conversations")
      .insert({
        business_id: businessId,
        customer_id: customerId,
        channel: "instagram",
        source: "instagram_api",
        external_conversation_id: conv.id,
        first_message_at: sorted[0].created_time,
        last_message_at: sorted[sorted.length - 1].created_time,
        message_count: sorted.length,
        state: "new",
      })
      .select("id")
      .single();
    if (conversationError || !newConversation) continue;

    const messageRows = sorted.map((m) => ({
      business_id: businessId,
      conversation_id: newConversation.id,
      sender_type: m.from.id === businessAccountId ? "business" : "customer",
      body: m.message ?? null,
      external_message_id: m.id,
      sent_at: m.created_time,
    }));
    await supabase.from("messages").insert(messageRows);

    createdConversations.push({
      id: newConversation.id,
      customerId,
      messages: messageRows.map((m) => ({ sender_type: m.sender_type, body: m.body })),
    });
  }

  // Also pick up any of this business's Instagram-sourced conversations
  // that exist but never got classified (a transient classification
  // failure on a previous run, for instance) — otherwise the "skip if
  // conversation already exists" dedup above means such a row would stay
  // unclassified forever, since no future run would ever touch it again.
  const { data: unclassified } = await supabase
    .from("conversations")
    .select("id, customer_id, messages(sender_type, body)")
    .eq("business_id", businessId)
    .eq("source", "instagram_api")
    .is("classified_at", null)
    .not("id", "in", `(${createdConversations.map((c) => c.id).join(",") || "00000000-0000-0000-0000-000000000000"})`);

  for (const conv of unclassified ?? []) {
    createdConversations.push({
      id: conv.id,
      customerId: conv.customer_id,
      messages: (conv.messages as { sender_type: string; body: string | null }[]) ?? [],
    });
  }

  await classifyAndScoreConversations(
    supabase,
    businessId,
    business?.avg_transaction_value ?? null,
    createdConversations,
  );

  // Founder request 2026-08-21: a business shouldn't start Engage from a
  // blank knowledge base when 30 days of their own real replies are
  // sitting right here. One-time per business (guarded by
  // knowledge_base_seeded_at) so a reconnect/re-fetch doesn't re-suggest
  // the same items again.
  if (!business?.knowledge_base_seeded_at) {
    await seedKnowledgeFromHistory(supabase, businessId, createdConversations);
  }

  return { conversationsImported: createdConversations.length };
}

async function seedKnowledgeFromHistory(
  supabase: ReturnType<typeof createServiceRoleClient>,
  businessId: string,
  createdConversations: CreatedConversation[],
): Promise<void> {
  // Only the business's own replies are candidate knowledge — customer
  // messages are questions/requests, not facts about the business.
  const businessReplies = createdConversations
    .flatMap((c) => c.messages)
    .filter((m) => m.sender_type === "business" && m.body && m.body.trim().length > 0)
    .map((m) => redactPii(m.body as string));

  // Mark seeded regardless of outcome (including "no replies found") —
  // this is a one-time-per-business operation, not a retry-until-success
  // one, otherwise every future historical fetch would keep re-attempting
  // it for a business that simply has few historical replies.
  if (businessReplies.length === 0) {
    await supabase.from("businesses").update({ knowledge_base_seeded_at: new Date().toISOString() }).eq("id", businessId);
    return;
  }

  const repliesText = businessReplies.join("\n\n");
  const [items, gapQuestions] = await Promise.all([
    extractKnowledgeItems(repliesText, "conversation_history"),
    extractKnowledgeGapQuestions(repliesText),
  ]);

  if (items && items.length > 0) {
    await supabase.from("knowledge_items").insert(
      items.map((item) => ({
        business_id: businessId,
        category: item.category,
        question: null,
        content: item.content,
        media_url: null,
        approved_at: null, // pending review, same as brochure/manual items
      })),
    );
  }

  // Founder request 2026-08-26: alongside what the AI extracted, also ask
  // about what it noticed was missing — a separate table/UI from the
  // pending-review list above (answering IS the approval here, see
  // answerKnowledgeGapQuestion in components/engage/knowledge/actions.ts).
  if (gapQuestions && gapQuestions.length > 0) {
    await supabase.from("knowledge_gap_questions").insert(
      gapQuestions.map((q) => ({
        business_id: businessId,
        category: q.category,
        question: q.question,
      })),
    );
  }

  await supabase.from("businesses").update({ knowledge_base_seeded_at: new Date().toISOString() }).eq("id", businessId);
}

// PLANS.md Phase 5.2 — live inbound message routing. Unlike every other
// function in this module, the caller (the webhook route) does NOT already
// know businessId — that's exactly what this resolves, from the webhook
// payload's own connected-account id. This is the one place where trusting
// the payload's identifiers is correct rather than a hole: the account id
// comes from Meta's own signed webhook delivery (verified upstream by the
// route's signature check), not from anything a client supplied.
export async function getConnectionByExternalAccountId(
  externalAccountId: string,
): Promise<{ businessId: string; accessToken: string } | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("channel_connections")
    .select("business_id, access_token_encrypted")
    .eq("channel", "instagram")
    .eq("external_account_id", externalAccountId)
    .is("disconnected_at", null)
    .maybeSingle();

  if (!data) return null;
  return { businessId: data.business_id, accessToken: decryptToken(data.access_token_encrypted) };
}

// Real-time webhooks only give the sender's numeric Instagram-scoped id,
// not a username — unlike the Conversations API used for historical fetch.
// Profile enrichment (fetching a display name) is a deliberate gap, not an
// oversight: it needs an extra Graph API call this hasn't been verified
// against yet, and getting the live loop working safely matters more right
// now than a display name. Logged in OUTSTANDINGS.md, not silently cut.
//
// One conversation thread per customer is assumed (reuses the most recent
// existing one for this business+customer, regardless of whether it came
// from historical import or a prior live message) — matches how Instagram
// DMs actually work, a single running thread per pair of accounts.
export async function findOrCreateConversationForInboundMessage(
  businessId: string,
  senderId: string,
): Promise<{ conversationId: string; customerId: string }> {
  const supabase = createServiceRoleClient();

  let customerId: string;
  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("business_id", businessId)
    .eq("external_customer_id", senderId)
    .maybeSingle();

  if (existingCustomer) {
    customerId = existingCustomer.id;
  } else {
    const { data: newCustomer, error } = await supabase
      .from("customers")
      .insert({ business_id: businessId, external_customer_id: senderId, source: "instagram_api" })
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
    .eq("channel", "instagram")
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
      channel: "instagram",
      source: "instagram_api",
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

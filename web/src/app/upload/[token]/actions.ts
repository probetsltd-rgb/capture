"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateUploadBatch, looksLikeText, looksLikeInstagramExport } from "@/lib/file-validation";
import { parseWhatsAppExport, guessBusinessSenderName, type ParsedConversation } from "@/lib/whatsapp/parse";
import { groupInstagramExportFiles, parseInstagramConversation } from "@/lib/instagram/parse";
import { classifyConversation } from "@/lib/classification/classify";

export type SkippedFile = { name: string; reason: string };

export type UploadState = {
  status: "idle" | "error" | "success";
  message: string | null;
  skipped?: SkippedFile[];
};

// The meaningful limit on a single upload batch — checked AFTER Instagram's
// multi-page conversations are grouped down to their real count, unlike
// file-validation.ts's MAX_FILES_PER_UPLOAD (a raw pre-grouping safety
// backstop only). Sized against a real constraint, not picked arbitrarily:
// classification below runs with CLASSIFY_CONCURRENCY in-flight calls at
// once, and real observed latency for this AI Gateway call is ~1-8s
// (TESTS.md 2026-08-11/2026-08-12). Worst case, 250 conversations at
// CLASSIFY_CONCURRENCY=10 is 25 sequential waves x ~8s = ~200s, comfortably
// inside Vercel's ~300s function budget with real margin for the DB writes
// and cold start on top. Raise this only alongside CLASSIFY_CONCURRENCY —
// they're the same tradeoff, not independent numbers.
const MAX_CONVERSATIONS_PER_UPLOAD = 250;
const CLASSIFY_CONCURRENCY = 10;

// Fixed-size worker pool, not one Promise.all(items.map(...)) — that would
// fire every classification call simultaneously, risking an AI Gateway
// rate-limit cliff under a large batch instead of a steady, bounded load.
async function mapWithConcurrency<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      await run(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function clientIp(headerList: Headers): string {
  const forwarded = headerList.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export async function submitUpload(
  token: string,
  _prevState: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const supabase = createServiceRoleClient();

  const { data: business, error: lookupError } = await supabase
    .from("businesses")
    .select("id, avg_transaction_value")
    .eq("upload_token", token)
    .maybeSingle();

  if (lookupError || !business) {
    return { status: "error", message: "This upload link is invalid." };
  }

  const avgTransactionValueInput = formData.get("avg_transaction_value");
  const parsedAvgValue =
    avgTransactionValueInput && String(avgTransactionValueInput).trim() !== ""
      ? Number(avgTransactionValueInput)
      : null;
  const avgTransactionValue =
    parsedAvgValue !== null && Number.isFinite(parsedAvgValue) && parsedAvgValue > 0
      ? parsedAvgValue
      : business.avg_transaction_value;

  if (avgTransactionValue !== business.avg_transaction_value) {
    await supabase.from("businesses").update({ avg_transaction_value: avgTransactionValue }).eq("id", business.id);
  }

  const headerList = await headers();
  const ip = clientIp(headerList);
  const { allowed } = await checkRateLimit(`upload:${ip}`, { max: 10, windowMinutes: 60 });
  if (!allowed) {
    return { status: "error", message: "Too many uploads from this network. Please try again later." };
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const validation = validateUploadBatch(files);
  if (!validation.ok) {
    return { status: "error", message: validation.reason };
  }

  // Parse everything first (in memory — raw files are never persisted, per
  // phase0/AUDIT_GUIDE.md's data-minimisation stance) before writing
  // anything, so a mid-batch failure doesn't leave a half-imported state.
  //
  // Two channels, routed by extension (already validated above):
  // - .txt -> WhatsApp, one file is one conversation, same as always.
  // - .json -> Instagram. Every conversation folder's export file is
  //   literally named message_1.json, so files are grouped into
  //   conversations by their JSON content (title/participants), not by
  //   filename — see groupInstagramExportFiles's own comment. A single
  //   conversation can span multiple files (message_1.json, message_2.json…
  //   for a long history), so this is a grouping pass before parsing, not a
  //   1:1 file-to-conversation loop like the WhatsApp path.
  const parsedByFile: { name: string; channel: "whatsapp" | "instagram"; parsed: ParsedConversation }[] = [];
  const skipped: SkippedFile[] = [];

  const txtFiles = files.filter((f) => f.name.toLowerCase().endsWith(".txt"));
  const jsonFiles = files.filter((f) => f.name.toLowerCase().endsWith(".json"));

  for (const file of txtFiles) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (!looksLikeText(buffer)) {
      skipped.push({ name: file.name, reason: "not plain text" });
      continue;
    }
    const text = new TextDecoder("utf-8").decode(buffer);
    const parsed = parseWhatsAppExport(text);
    if (!parsed) {
      skipped.push({ name: file.name, reason: "no messages found" });
      continue;
    }
    parsedByFile.push({ name: file.name, channel: "whatsapp", parsed });
  }

  const jsonFileTexts: { name: string; text: string }[] = [];
  for (const file of jsonFiles) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (!looksLikeText(buffer)) {
      skipped.push({ name: file.name, reason: "not plain text" });
      continue;
    }
    const text = new TextDecoder("utf-8").decode(buffer);
    if (!looksLikeInstagramExport(text)) {
      // Real Instagram exports include many non-message files (posts,
      // likes, ads data, account activity...) alongside the message_N.json
      // files we actually want — this is the expected, common case for a
      // full-export .zip, not a sign of a broken upload. Worded as such so
      // a genuinely large skip count doesn't read as N failures.
      skipped.push({ name: file.name, reason: "not a conversation export file" });
      continue;
    }
    jsonFileTexts.push({ name: file.name, text });
  }

  if (jsonFileTexts.length > 0) {
    const { groups, unparseable } = groupInstagramExportFiles(jsonFileTexts);
    for (const name of unparseable) skipped.push({ name, reason: "not a conversation export file" });

    for (const [conversationKey, pages] of groups) {
      const parsed = parseInstagramConversation(pages);
      if (!parsed) {
        skipped.push({ name: conversationKey, reason: "no messages found" });
        continue;
      }
      parsedByFile.push({ name: conversationKey, channel: "instagram", parsed });
    }
  }

  if (parsedByFile.length === 0) {
    return {
      status: "error",
      message: "None of the uploaded files could be read as WhatsApp or Instagram exports.",
      skipped,
    };
  }

  // Checked here, not against raw file count (file-validation.ts's
  // MAX_FILES_PER_UPLOAD) — a single Instagram conversation can span many
  // message_N.json pages, so the real batch size is only known after
  // grouping, and this is the number that actually determines classification
  // load below.
  if (parsedByFile.length > MAX_CONVERSATIONS_PER_UPLOAD) {
    return {
      status: "error",
      message: `Too many conversations at once (${parsedByFile.length}, max ${MAX_CONVERSATIONS_PER_UPLOAD}). Please upload in smaller batches — for example, by date range.`,
    };
  }

  const businessSenderName = guessBusinessSenderName(parsedByFile.map((f) => f.parsed));

  let created = 0;
  const createdConversations: {
    id: string;
    customerId: string;
    messages: { sender_type: string; body: string | null }[];
  }[] = [];

  for (const { channel, parsed } of parsedByFile) {
    const otherSenders = new Set(
      parsed.messages.map((m) => m.sender).filter((s) => s !== businessSenderName),
    );
    // Expect exactly one other party in a 1:1 export; if there are several
    // (e.g. a group chat got exported), still proceed — label the customer
    // generically rather than reject the whole file.
    const customerName = otherSenders.size === 1 ? [...otherSenders][0] : "Unknown";

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({ business_id: business.id, name: customerName, source: "manual_export" })
      .select("id")
      .single();
    if (customerError || !customer) continue;

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .insert({
        business_id: business.id,
        customer_id: customer.id,
        channel,
        source: "manual_export",
        first_message_at: parsed.firstMessageAt.toISOString(),
        last_message_at: parsed.lastMessageAt.toISOString(),
        message_count: parsed.messages.length,
        state: "new",
      })
      .select("id")
      .single();
    if (conversationError || !conversation) continue;

    const messageRows = parsed.messages.map((m) => ({
      business_id: business.id,
      conversation_id: conversation.id,
      sender_type: m.sender === businessSenderName ? "business" : "customer",
      body: m.body,
      sent_at: m.sentAt.toISOString(),
    }));
    await supabase.from("messages").insert(messageRows);

    createdConversations.push({ id: conversation.id, customerId: customer.id, messages: messageRows });
    created++;
  }

  if (created === 0) {
    return { status: "error", message: "We couldn't process any of the uploaded files. Please try again." };
  }

  // Classify after the response is sent — PRD §7 treats "Capture analyses
  // them" as a distinct step after upload, not something the uploader
  // should sit waiting on. `after()` still runs within this invocation's
  // max duration, it just doesn't block the response.
  after(async () => {
    // Bounded concurrency (CLASSIFY_CONCURRENCY), and each conversation's
    // classification + writes are isolated in their own try/catch —
    // classifyConversation re-throws anything other than NoObjectGeneratedError
    // (e.g. a transient AI Gateway error), and without this a single such
    // failure partway through a large batch would silently abort
    // classification for every conversation still waiting behind it in
    // `after()`, with no error visible anywhere.
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
        // mapping exactly, so real and simulated data behave the same way
        // once Phase 2 (Recover) starts reading from `opportunities`.
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
          business_id: business.id,
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
        // classifying. It's left with classified_at null, same as the
        // NoObjectGeneratedError case above — visibly unclassified rather
        // than silently wrong.
        console.error(`Classification failed for conversation ${conv.id}:`, err);
      }
    });
  });

  return {
    status: "success",
    message: `Received ${created} conversation${created === 1 ? "" : "s"}. Your Revenue Leak Report is ready below.`,
    skipped: skipped.length > 0 ? skipped : undefined,
  };
}

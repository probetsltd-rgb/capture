"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateUploadBatch, looksLikeText } from "@/lib/file-validation";
import { parseWhatsAppExport, guessBusinessSenderName } from "@/lib/whatsapp/parse";
import { classifyConversation } from "@/lib/classification/classify";

export type UploadState = {
  status: "idle" | "error" | "success";
  message: string | null;
};

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
  const parsedByFile: { name: string; parsed: NonNullable<ReturnType<typeof parseWhatsAppExport>> }[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (!looksLikeText(buffer)) {
      skipped.push(`${file.name} (not plain text)`);
      continue;
    }
    const text = new TextDecoder("utf-8").decode(buffer);
    const parsed = parseWhatsAppExport(text);
    if (!parsed) {
      skipped.push(`${file.name} (no messages found)`);
      continue;
    }
    parsedByFile.push({ name: file.name, parsed });
  }

  if (parsedByFile.length === 0) {
    return {
      status: "error",
      message: `None of the uploaded files could be read as WhatsApp exports. ${skipped.join("; ")}`,
    };
  }

  const businessSenderName = guessBusinessSenderName(parsedByFile.map((f) => f.parsed));

  let created = 0;
  const createdConversations: {
    id: string;
    customerId: string;
    messages: { sender_type: string; body: string | null }[];
  }[] = [];

  for (const { parsed } of parsedByFile) {
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
        channel: "whatsapp",
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
    for (const conv of createdConversations) {
      const result = await classifyConversation(conv.messages);
      if (!result) continue; // leave classified_at null — flagged as unclassified, not guessed
      const { reasoning, ...fields } = result;
      await supabase
        .from("conversations")
        .update({ ...fields, classification_notes: reasoning, classified_at: new Date().toISOString() })
        .eq("id", conv.id);

      if (fields.leakage_type === "none") continue;

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
    }
  });

  const skippedNote = skipped.length > 0 ? ` (${skipped.length} file(s) skipped: ${skipped.join("; ")})` : "";
  return {
    status: "success",
    message: `Received ${created} conversation(s)${skippedNote}. We'll be in touch once your Revenue Leak Report is ready.`,
  };
}

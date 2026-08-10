"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  INDUSTRIES,
  REVENUE_BUCKETS,
  CONVERSATION_VOLUME_BUCKETS,
  CONSENT_VERSION,
} from "./constants";

export type IntakeState = {
  status: "idle" | "error" | "success";
  message: string | null;
  uploadUrl?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clientIp(headerList: Headers): string {
  // x-forwarded-for is set (and spoofing-guarded) by Vercel's edge network,
  // not user-controllable. Falls back to a shared bucket in local dev where
  // the header is typically absent.
  const forwarded = headerList.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export async function submitIntake(
  _prevState: IntakeState,
  formData: FormData,
): Promise<IntakeState> {
  // Honeypot: a field real users never see or fill. Bots that fill every
  // input trip this. Report success without writing anything, so scripted
  // submitters don't learn the check exists.
  if (String(formData.get("website_url") ?? "").trim() !== "") {
    return { status: "success", message: null };
  }

  const businessName = String(formData.get("business_name") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();
  const websiteOrInstagram = String(formData.get("website_or_instagram") ?? "").trim();
  const revenueBucket = String(formData.get("revenue_bucket") ?? "").trim();
  const volumeBucket = String(formData.get("volume_bucket") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim();
  const contactPhone = String(formData.get("contact_phone") ?? "").trim();
  const consent = formData.get("consent") === "on";

  if (!businessName || businessName.length > 200) {
    return { status: "error", message: "Business name is required." };
  }
  if (!INDUSTRIES.some((i) => i.value === industry)) {
    return { status: "error", message: "Please choose an industry." };
  }
  if (!EMAIL_RE.test(contactEmail)) {
    return { status: "error", message: "A valid contact email is required." };
  }
  const revenue = REVENUE_BUCKETS.find((b) => b.value === revenueBucket);
  if (!revenue) {
    return { status: "error", message: "Please choose an approximate annual revenue." };
  }
  const volume = CONVERSATION_VOLUME_BUCKETS.find((b) => b.value === volumeBucket);
  if (!volume) {
    return { status: "error", message: "Please choose an approximate monthly conversation volume." };
  }
  if (!consent) {
    return { status: "error", message: "Please confirm you agree before submitting." };
  }

  const headerList = await headers();
  const ip = clientIp(headerList);

  const { allowed } = await checkRateLimit(`find_intake:${ip}`, {
    max: 5,
    windowMinutes: 60,
  });
  if (!allowed) {
    return {
      status: "error",
      message: "Too many submissions from this network. Please try again later.",
    };
  }

  const uploadToken = randomBytes(32).toString("hex");

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("businesses").insert({
    name: businessName,
    industry,
    website: websiteOrInstagram || null,
    contact_email: contactEmail,
    contact_phone: contactPhone || null,
    approx_annual_revenue: revenue.midpoint,
    approx_monthly_conversations: volume.midpoint,
    consent_given_at: new Date().toISOString(),
    consent_version: CONSENT_VERSION,
    intake_ip: ip === "unknown" ? null : ip,
    upload_token: uploadToken,
  });

  if (error) {
    return {
      status: "error",
      message: "Something went wrong on our end. Please try again in a moment.",
    };
  }

  return {
    status: "success",
    uploadUrl: `/upload/${uploadToken}`,
    message:
      "Thanks — next, upload a sample of your WhatsApp conversations so we can put your Revenue Leak Report together.",
  };
}

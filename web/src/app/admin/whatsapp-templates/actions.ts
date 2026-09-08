"use server";

import { createClient } from "@/lib/supabase/server";
import { getWhatsAppConnectionForBusiness } from "@/lib/channels/whatsapp";
import { createMessageTemplate, type TemplateCategory } from "@/lib/channels/whatsapp-api";

export type ActionResult = { ok: boolean; message: string };

// Founder instruction 2026-09-08: same am_platform_admin() gate as every
// other /admin action — this isn't customer-facing yet (DEP-3's broader
// design, e.g. which business decides what a template says, isn't
// resolved), it exists right now to (1) give the WhatsApp App Review
// video something real to record against and (2) be genuine first
// groundwork for DEP-3, not a throwaway demo prop.
export async function createWhatsAppTemplate(
  businessId: string,
  params: { name: string; category: TemplateCategory; language: string; bodyText: string; bodyExample: string },
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("am_platform_admin");
  if (!isAdmin) return { ok: false, message: "Not authorized." };

  const connection = await getWhatsAppConnectionForBusiness(businessId);
  if (!connection) return { ok: false, message: "No active WhatsApp connection for this business." };

  try {
    const result = await createMessageTemplate(connection.accessToken, connection.wabaId, {
      name: params.name,
      category: params.category,
      language: params.language,
      bodyText: params.bodyText,
      bodyExample: params.bodyExample
        ? params.bodyExample.split(",").map((s) => s.trim())
        : undefined,
    });
    return { ok: true, message: `Template "${params.name}" created — status: ${result.status} (id ${result.id}).` };
  } catch (err) {
    console.error("WhatsApp template creation failed", err);
    return { ok: false, message: err instanceof Error ? err.message : "Template creation failed." };
  }
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnBusinessId } from "@/lib/business-membership";
import { MAX_AUTOMATIONS_PER_OPPORTUNITY } from "@/lib/recover/rules";
import { RulesForm } from "./RulesForm";
import { NotificationPhoneForm } from "./NotificationPhoneForm";
import { DeleteInstagramDataButton } from "../DeleteInstagramDataButton";
import { ResetConversationHistoryButton } from "../ResetConversationHistoryButton";

export default async function DashboardSettingsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login?next=/dashboard/settings");

  const userId = claims.claims.sub as string;
  const businessId = await getOwnBusinessId(supabase, userId);
  if (!businessId) redirect("/onboarding");

  const { data: membership } = await supabase
    .from("business_members")
    .select("whatsapp_number")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, max_recover_followups, escalation_keywords")
    .eq("id", businessId)
    .maybeSingle();

  if (!business) redirect("/onboarding");

  return (
    <main className="shell app-page">
      <p>
        <Link href="/dashboard">← Back to dashboard</Link>
      </p>
      <h1>Configure rules — {business.name}</h1>
      <RulesForm
        businessId={businessId}
        maxRecoverFollowups={business.max_recover_followups}
        escalationKeywords={(business.escalation_keywords as string[] | null) ?? []}
        platformMaxRecoverFollowups={MAX_AUTOMATIONS_PER_OPPORTUNITY}
      />

      <section style={{ marginTop: "var(--s8)" }}>
        <h2>Notifications</h2>
        <p className="meta">
          Add your WhatsApp number so escalation alerts can reach you there in future — email works today.
        </p>
        <NotificationPhoneForm
          businessId={businessId}
          currentNumber={(membership?.whatsapp_number as string | null) ?? null}
        />
      </section>

      <section style={{ marginTop: "var(--s8)" }}>
        <h2>Data &amp; privacy</h2>
        <p className="meta">
          See our <Link href="/privacy">Terms &amp; Privacy</Link> for how Capture handles your data. To
          delete everything Capture has stored from your connected Instagram account specifically:
        </p>
        <DeleteInstagramDataButton businessId={businessId} />
        <p className="meta" style={{ marginTop: "var(--s5)" }}>
          Preparing a demo and want to clear conversation history without disconnecting Instagram?
        </p>
        <ResetConversationHistoryButton businessId={businessId} />
      </section>
    </main>
  );
}

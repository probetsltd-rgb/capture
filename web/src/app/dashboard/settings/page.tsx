import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnBusinessId } from "@/lib/business-membership";
import { MAX_AUTOMATIONS_PER_OPPORTUNITY } from "@/lib/recover/rules";
import { RulesForm } from "./RulesForm";

export default async function DashboardSettingsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login?next=/dashboard/settings");

  const userId = claims.claims.sub as string;
  const businessId = await getOwnBusinessId(supabase, userId);
  if (!businessId) redirect("/onboarding");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, max_recover_followups, escalation_keywords")
    .eq("id", businessId)
    .maybeSingle();

  if (!business) redirect("/onboarding");

  return (
    <main style={{ maxWidth: 560, margin: "3rem auto", fontFamily: "sans-serif" }}>
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
    </main>
  );
}

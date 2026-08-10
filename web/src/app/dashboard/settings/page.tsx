import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnBusinessId } from "@/lib/business-membership";
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
    .select("id, name, max_ai_followups, max_recover_followups, escalation_keywords")
    .eq("id", businessId)
    .maybeSingle();

  if (!business) redirect("/onboarding");

  return (
    <main style={{ maxWidth: 560, margin: "3rem auto", fontFamily: "sans-serif" }}>
      <p>
        <Link href="/dashboard">← Back to dashboard</Link>
      </p>
      <h1>Configure rules — {business.name}</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        Overrides the platform defaults (2 follow-ups max for both Recover and Prevent). Leave a field blank to
        use the default.
      </p>
      <RulesForm
        businessId={businessId}
        maxAiFollowups={business.max_ai_followups}
        maxRecoverFollowups={business.max_recover_followups}
        escalationKeywords={(business.escalation_keywords as string[] | null) ?? []}
      />
    </main>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnBusinessId } from "@/lib/business-membership";
import { EngageKnowledgeView } from "@/components/engage/knowledge/EngageKnowledgeView";

export default async function DashboardEngageKnowledgePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login?next=/dashboard/engage/knowledge");

  const userId = claims.claims.sub as string;
  const businessId = await getOwnBusinessId(supabase, userId);
  if (!businessId) redirect("/dashboard");

  return <EngageKnowledgeView businessId={businessId} backHref="/dashboard/engage" backLabel="← Back to Engage" />;
}

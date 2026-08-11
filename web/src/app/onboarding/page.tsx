import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { OnboardingForm } from "./OnboardingForm";
import { ClaimButton } from "./ClaimButton";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string }>;
}) {
  const { claim } = await searchParams;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login?next=/onboarding");

  const userId = claims.claims.sub as string;

  // Always filter by user_id explicitly rather than trusting RLS's default
  // scoping here — platform_admins can see every business_members row via
  // is_business_member(), so an unfiltered select would wrongly look like
  // "already a member" for the founder's own account.
  const { data: ownMemberships } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("user_id", userId)
    .limit(1);

  if (ownMemberships && ownMemberships.length > 0) {
    redirect("/dashboard");
  }

  if (claim) {
    const service = createServiceRoleClient();
    const { data: business } = await service
      .from("businesses")
      .select("id, name")
      .eq("upload_token", claim)
      .maybeSingle();

    if (!business) {
      return (
        <main className="shell app-page">
          <h1>Claim link invalid</h1>
          <p>This link doesn&apos;t match a business we know about.</p>
        </main>
      );
    }

    return (
      <main className="shell app-page">
        <h1>Claim your account</h1>
        <p>
          Link <strong>{business.name}</strong> to {claims.claims.email as string}?
        </p>
        <ClaimButton token={claim} />
      </main>
    );
  }

  return (
    <main className="shell app-page">
      <h1>Set up your business</h1>
      <p>A few details, then we&apos;ll get your Recover/Prevent workspace ready.</p>
      <OnboardingForm />
    </main>
  );
}

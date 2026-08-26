import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RecoverPlanEditForm } from "./RecoverPlanEditForm";

// Mirrors /admin/plans exactly (same am_platform_admin() gate, same
// admin-editable-not-hardcoded principle) but for Recover's one-time tiers.
// Simpler than Engage's plan editor: no Paystack-side Plan object to keep
// in sync — a one-time charge reads price_kobo fresh at checkout time (see
// dashboard/recover/actions.ts), so there's nothing to push to Paystack
// when a price changes here.
export default async function AdminRecoverPlansPage() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("am_platform_admin");
  if (!isAdmin) redirect("/dashboard");

  const { data: plans } = await supabase
    .from("recover_plans")
    .select("id, display_name, price_kobo, lookback_months, sort_order")
    .order("sort_order", { ascending: true });

  return (
    <main className="shell app-page">
      <h1>Capture — Recover Plans</h1>
      <p className="meta">
        <Link href="/admin">← Back to Admin</Link>
      </p>

      <section>
        <h2>Tiers</h2>
        <div style={{ display: "flex", gap: "var(--s5)", flexWrap: "wrap" }}>
          {(plans ?? []).map((plan) => (
            <RecoverPlanEditForm
              key={plan.id}
              plan={{
                id: plan.id,
                displayName: plan.display_name,
                priceKobo: plan.price_kobo,
                lookbackMonths: plan.lookback_months,
              }}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

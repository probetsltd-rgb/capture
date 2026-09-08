import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { TemplateForm } from "./TemplateForm";

// Founder instruction 2026-09-08: minimal, admin-only WhatsApp message
// template tool — built for the WhatsApp App Review video
// (whatsapp_business_management needs a real demo of the app creating a
// template, not Meta's own WhatsApp Manager UI) and as real first
// groundwork for DEP-3. Not customer-facing yet — DEP-3's broader design
// (which business decides template content, approval-status visibility)
// isn't resolved, so this stays under /admin like plans/recover-plans.
export default async function AdminWhatsAppTemplatesPage() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("am_platform_admin");
  if (!isAdmin) redirect("/dashboard");

  // channel_connections has no RLS policy for `authenticated` at all (see
  // that migration's header comment) — service-role read here, same as
  // every other admin view of connection state. Two plain queries rather
  // than an embedded-resource join — no existing precedent in this
  // codebase for that join syntax, and this is a short, admin-only list.
  const serviceRole = createServiceRoleClient();
  const { data: connections } = await serviceRole
    .from("channel_connections")
    .select("business_id, username")
    .eq("channel", "whatsapp")
    .is("disconnected_at", null);

  const businessIds = (connections ?? []).map((c) => c.business_id);
  const { data: businessRows } = businessIds.length
    ? await serviceRole.from("businesses").select("id, name").in("id", businessIds)
    : { data: [] };
  const businessNameById = new Map((businessRows ?? []).map((b) => [b.id, b.name]));

  const businesses = (connections ?? []).map((c) => ({
    business_id: c.business_id,
    username: c.username,
    name: businessNameById.get(c.business_id) ?? "Unknown business",
  }));

  return (
    <main className="shell app-page">
      <h1>WhatsApp Message Templates</h1>
      <p className="meta">
        <Link href="/admin">← Back to Admin</Link>
      </p>

      {businesses.length === 0 && <p>No business has an active WhatsApp connection yet.</p>}

      {businesses.map((b) => (
        <section key={b.business_id} style={{ marginTop: "var(--s7)" }}>
          <h2>
            {b.name} {b.username ? `— ${b.username}` : ""}
          </h2>
          <TemplateForm businessId={b.business_id} />
        </section>
      ))}
    </main>
  );
}

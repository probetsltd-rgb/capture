import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { SiteNav, SiteFooter } from "@/components/SiteChrome";
import { UploadForm } from "./UploadForm";

export default async function UploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceRoleClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("upload_token", token)
    .maybeSingle();

  if (!business) {
    return (
      <div className="page">
        <SiteNav />
        <main>
          <div className="shell center-page">
            <h1 className="h2">Link not found</h1>
            <p className="body" style={{ marginTop: "var(--s4)" }}>
              This upload link is invalid or has expired. Please contact us to get a new one.
            </p>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="page">
      <SiteNav />
      <main>
        <div className="shell center-page">
          <h1 className="h2">Upload your conversations</h1>
          <p className="body" style={{ marginTop: "var(--s3)" }}>
            Uploading for <strong style={{ color: "var(--ink)" }}>{business.name}</strong>.
          </p>
          <p className="meta" style={{ marginTop: "var(--s5)" }}>
            Export 20–50 representative WhatsApp conversations — in WhatsApp, open a chat →
            Export Chat → <strong>Without Media</strong> — and upload the resulting .txt files.
          </p>
          <div style={{ marginTop: "var(--s6)" }}>
            <UploadForm token={token} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

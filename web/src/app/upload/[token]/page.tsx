import { createServiceRoleClient } from "@/lib/supabase/service-role";
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
      <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "sans-serif" }}>
        <h1>Link not found</h1>
        <p>This upload link is invalid or has expired. Please contact us to get a new one.</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "3rem auto", fontFamily: "sans-serif" }}>
      <h1>Upload your conversations</h1>
      <p>
        Uploading for <strong>{business.name}</strong>.
      </p>
      <p>
        Export 20–50 representative WhatsApp conversations (Settings → individual chat → Export
        Chat → <strong>Without Media</strong>) and upload the resulting .txt files here.
      </p>
      <UploadForm token={token} />
    </main>
  );
}

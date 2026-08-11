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
        <div className="shell band">
          <div className="intake">
            <div className="intake__aside">
              <h1 className="h2">Upload your conversations</h1>
              <p className="body" style={{ marginTop: "var(--s3)" }}>
                Uploading for <strong style={{ color: "var(--ink)" }}>{business.name}</strong>. Use
                whichever channel your customers actually message you on — WhatsApp, Instagram, or
                both.
              </p>

              <h2 className="h3" style={{ marginTop: "var(--s7)" }}>
                WhatsApp
              </h2>
              <p className="meta" style={{ marginTop: "var(--s2)" }}>
                About 15 seconds per conversation — for 20–50 conversations, budget 5–15 minutes.
              </p>
              <ol className="flow" style={{ marginTop: "var(--s4)" }}>
                <li className="flow__step">
                  <span className="flow__marker" aria-hidden="true">
                    <span className="flow__dot" />
                  </span>
                  <span>
                    <span className="flow__label">Open a chat, tap the contact/group name</span>
                    <span className="flow__note" style={{ display: "block" }}>
                      Then scroll down to <strong>Export Chat</strong>
                    </span>
                  </span>
                </li>
                <li className="flow__step">
                  <span className="flow__marker" aria-hidden="true">
                    <span className="flow__dot" />
                  </span>
                  <span>
                    <span className="flow__label">Choose Without Media</span>
                    <span className="flow__note" style={{ display: "block" }}>
                      Produces a small .txt file
                    </span>
                  </span>
                </li>
                <li className="flow__step flow__step--realised">
                  <span className="flow__marker" aria-hidden="true">
                    <span className="flow__dot" />
                  </span>
                  <span>
                    <span className="flow__label">Repeat for each conversation, then upload the .txt files</span>
                    <span className="flow__note" style={{ display: "block" }}>
                      There&apos;s no bulk export in WhatsApp — this is the one-chat-at-a-time
                      native flow, repeated
                    </span>
                  </span>
                </li>
              </ol>

              <h2 className="h3" style={{ marginTop: "var(--s7)" }}>
                Instagram
              </h2>
              <p className="meta" style={{ marginTop: "var(--s2)" }}>
                One request covers every DM at once — but Instagram emails you a download link
                rather than giving you the file immediately, and that link expires in about 4
                days.
              </p>
              <ol className="flow" style={{ marginTop: "var(--s4)" }}>
                <li className="flow__step">
                  <span className="flow__marker" aria-hidden="true">
                    <span className="flow__dot" />
                  </span>
                  <span>
                    <span className="flow__label">
                      Instagram app → Settings → Accounts Center → Your Information and Permissions
                    </span>
                    <span className="flow__note" style={{ display: "block" }}>
                      Then <strong>Export Your Information</strong>
                    </span>
                  </span>
                </li>
                <li className="flow__step">
                  <span className="flow__marker" aria-hidden="true">
                    <span className="flow__dot" />
                  </span>
                  <span>
                    <span className="flow__label">Select Messages only, format JSON</span>
                    <span className="flow__note" style={{ display: "block" }}>
                      Leaving other data types out keeps the file small and ready sooner
                    </span>
                  </span>
                </li>
                <li className="flow__step">
                  <span className="flow__marker" aria-hidden="true">
                    <span className="flow__dot" />
                  </span>
                  <span>
                    <span className="flow__label">Wait for the email, then download and unzip it</span>
                    <span className="flow__note" style={{ display: "block" }}>
                      Can take anywhere from minutes to a few hours
                    </span>
                  </span>
                </li>
                <li className="flow__step flow__step--realised">
                  <span className="flow__marker" aria-hidden="true">
                    <span className="flow__dot" />
                  </span>
                  <span>
                    <span className="flow__label">
                      Upload the message_1.json files from inside messages/inbox
                    </span>
                    <span className="flow__note" style={{ display: "block" }}>
                      Every conversation&apos;s file has the same name — that&apos;s fine, upload
                      them all together and we&apos;ll sort out which is which
                    </span>
                  </span>
                </li>
              </ol>
            </div>

            <div className="intake__form">
              <UploadForm token={token} />
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

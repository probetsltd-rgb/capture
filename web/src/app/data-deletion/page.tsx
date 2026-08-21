import Link from "next/link";
import { SiteNav, SiteFooter } from "@/components/SiteChrome";

// Meta's Data Deletion Instructions requirement for App Review
// (META_APP_REVIEW.md §1/§5) — a stable, public, unauthenticated URL
// describing a genuine process for a user to have their data deleted.
// Deliberately a dedicated page rather than a section buried in /privacy:
// Meta's dashboard field wants one specific URL, and a direct link is
// clearer for anyone who arrives here from Instagram's own "Apps and
// websites" settings, not just from Capture's own site.
export default function DataDeletionPage() {
  return (
    <div className="page">
      <SiteNav />
      <main>
        <div className="shell band prose">
          <h1 className="h2">Data Deletion Instructions</h1>

          <h2>If you&apos;re a Capture business customer</h2>
          <p>
            Sign in to your <Link href="/dashboard">dashboard</Link> and go to{" "}
            <Link href="/dashboard/settings">Settings → Data &amp; privacy</Link>. &quot;Delete my
            Instagram data&quot; immediately and permanently deletes every customer, conversation, and
            message Capture has stored from your connected Instagram account, and removes the stored
            connection itself. This is self-serve and takes effect immediately — there&apos;s no waiting
            period and no manual review on our side.
          </p>
          <p>
            This does not affect your Find or Recover data, which are separate — see{" "}
            <Link href="/privacy">Terms &amp; Privacy</Link> for what each product stores.
          </p>

          <h2>If you can&apos;t sign in, or you&apos;re one of a business&apos;s customers</h2>
          <p>
            Email <a href="mailto:probetsltd@gmail.com">probetsltd@gmail.com</a> with the Instagram
            account or business name involved. We&apos;ll locate and delete the relevant data within 30
            days and confirm by email once it&apos;s done.
          </p>

          <h2>What gets deleted</h2>
          <p>
            Your Instagram profile identifiers we stored, the encrypted access token for the connection,
            and every message and conversation record sourced from that connection. Deletion is
            permanent — reconnecting afterward starts fresh, it does not restore what was deleted.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

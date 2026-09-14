import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav, SiteFooter } from "@/components/SiteChrome";

export const metadata: Metadata = {
  title: "Terms & Privacy",
  description: "Capture's terms of service and privacy policy for Find, Recover, and Engage.",
  alternates: { canonical: "/privacy" },
};

// Terms & Privacy — deliberately one document for the whole Capture
// service, not three separate policies per product. Find, Recover, and
// Engage are products of Capture, not separate services with separate
// terms — using any of them means you're using Capture, and this page
// governs that whole relationship. Rewritten 2026-08-19 to add
// Instagram-specific data handling (a hard Meta App Review prerequisite,
// see META_APP_REVIEW.md) and genuine product-responsibility coverage for
// all three products, replacing the earlier version that only described
// the WhatsApp-export Find flow.
export default function PrivacyPage() {
  return (
    <div className="page">
      <SiteNav />
      <main>
        <div className="shell band prose">
          <h1 className="h2">Capture — Terms &amp; Privacy</h1>
          <p className="meta">Last updated 2026-09-07.</p>

          <h2>What Capture is</h2>
          <p>
            Capture (&quot;Capture,&quot; &quot;we,&quot; &quot;us&quot;) is one service made up of three
            products:
          </p>
          <ul>
            <li>
              <strong>Find</strong> — a free audit that reads a sample of your existing conversations
              (WhatsApp exports, or an Instagram data export) and estimates where enquiries are going
              unanswered or cold.
            </li>
            <li>
              <strong>Recover</strong> — identifies dormant, high-intent opportunities in your
              conversation history and helps your team follow up with them.
            </li>
            <li>
              <strong>Engage</strong> — connects to your business&apos;s own Instagram account and
              responds to customer Direct Messages using only information you&apos;ve explicitly
              approved, escalating anything it can&apos;t safely answer to your team.
            </li>
          </ul>
          <p>
            These terms apply to your whole relationship with Capture, not separately per product. Where
            something applies to only one of them, we say so explicitly below. You never need to use all
            three — each is independently useful on its own.
          </p>

          <h2>What each product does and doesn&apos;t do</h2>
          <p>
            <strong>Find</strong> produces estimates, not guarantees. Numbers like &quot;potential
            recoverable revenue&quot; are calculated from patterns in your own conversation data and are
            our best estimate, not a promise of actual revenue.
          </p>
          <p>
            <strong>Recover</strong> identifies and prioritizes opportunities and helps draft outreach —
            it does not autonomously negotiate, issue refunds, or make bookings on your behalf.
          </p>
          <p>
            <strong>Engage</strong> only answers from information you&apos;ve explicitly approved in your
            knowledge base — never general knowledge, never a guess. Anything it isn&apos;t confident is
            fully covered by your approved knowledge, or that needs judgement (price negotiation, a
            complaint, an unusual request), is routed to your team instead of answered automatically. You
            can take over any conversation at any time, which immediately and permanently stops automated
            replies on that conversation. If a customer replies while your team is handling it, the assigned
            team member is notified right away, with a reminder after 10 minutes of no response — Engage
            never resumes automated replies on its own, since it has no way to know what your team already
            told the customer. Engage does not autonomously negotiate, issue refunds, process payments, or
            make bookings.
          </p>

          <h2>Data we collect, and why</h2>
          <p>
            <strong>Find</strong> collects the business details you submit on the audit form (business
            name, industry, website/Instagram, approximate revenue and conversation volume, your contact
            details), and the conversation export you provide (a WhatsApp chat export, or an Instagram
            data export) — used only to produce your Revenue Leak Report. Raw export files are deleted
            once your audit is complete and confirmed with you.
          </p>
          <p>
            <strong>Engage — Instagram data specifically:</strong> when you connect your Instagram
            account, we access and store:
          </p>
          <ul>
            <li>Your connected account&apos;s username and Instagram-assigned ID.</li>
            <li>
              The OAuth access token, encrypted at rest (AES-256-GCM) and never exposed to any browser or
              client.
            </li>
            <li>
              Direct message content sent to and from the connected account, and basic sender/recipient
              identifiers, so Engage can respond to and track conversations.
            </li>
          </ul>
          <p>
            This data is used only to operate Engage for your business: reading and replying to your own
            customers&apos; messages, and computing your own conversation statistics. We do not use
            Instagram message content to train AI models, and we don&apos;t share it with any third party
            except the AI model provider used to generate a reply — and only the specific message being
            answered, never your full message history at once.
          </p>
          <p>
            <strong>Recover</strong> doesn&apos;t collect data separately — it works from the same
            conversation data Find or Engage already gathered.
          </p>
          <p>
            <strong>The knowledge base you configure for Engage</strong> (hours, pricing, policies,
            product details you write and approve) is stored to answer customers from — never guessed,
            never invented, never answered from anywhere else.
          </p>

          <h2>How we use AI</h2>
          <p>
            We use AI models to classify conversations (Find, Recover) and to draft or send replies
            (Engage), constrained to only the approved information described above. We do not use your
            conversations to train AI models without your explicit, separate permission. Personal
            information is minimised before any content is sent to an AI provider for processing.
          </p>

          <h2>Data retention and deletion</h2>
          <p>
            You can ask us to delete your data at any time by contacting us at{" "}
            <a href="mailto:probetsltd@gmail.com">probetsltd@gmail.com</a>. For Instagram data
            specifically, you can delete it yourself, immediately, from your dashboard — see{" "}
            <Link href="/data-deletion">Data Deletion Instructions</Link> for exactly how.
          </p>

          <h2>Your rights</h2>
          <p>
            You can ask what data we hold about your business, correct it, or delete it, at any time,
            using the contact above.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

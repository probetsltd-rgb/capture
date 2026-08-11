import { SiteNav, SiteFooter } from "@/components/SiteChrome";

export default function PrivacyPage() {
  return (
    <div className="page">
      <SiteNav />
      <main>
        <div className="shell band prose">
      <div className="notice" style={{ marginBottom: "var(--s6)" }}>
        <strong>Draft, not final legal terms.</strong> This page describes, in plain language,
        how Capture currently handles data during the free Revenue Leak Audit. It is not yet a
        reviewed privacy policy or terms of service — those are pending legal review before
        Capture is used with real customer data at scale. If anything here is unclear, ask us
        directly before submitting the form.
      </div>

      <h1 className="h2">Privacy &amp; Data Handling</h1>

      <h2>What we collect at this step</h2>
      <p>
        The business details you submit on the Find My Revenue Leaks form (business name,
        industry, website/Instagram, approximate revenue and conversation volume, and your
        contact details).
      </p>

      <h2>What happens next</h2>
      <p>
        We follow up to collect a sample of your WhatsApp conversations for analysis. Those
        conversations are used only to produce your Revenue Leak Report — an estimate of where
        enquiries may be going unanswered or cold, not a revenue guarantee.
      </p>

      <h2>How we handle conversation data</h2>
      <ul>
        <li>Encrypted in transit and at rest.</li>
        <li>Access is limited to what&apos;s needed to produce your report.</li>
        <li>
          We do not use your conversations to train AI models without your explicit, separate
          permission.
        </li>
        <li>
          Personal information is minimised before any content is sent to an AI provider for
          classification.
        </li>
        <li>Raw exports are deleted once your audit is complete and confirmed with you.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask us to delete your data at any time. Contact us using the email you submitted
        the form with.
      </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

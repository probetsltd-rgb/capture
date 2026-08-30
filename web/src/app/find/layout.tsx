import type { Metadata } from "next";
import { buildFaqJsonLd } from "@/lib/seo/faq-jsonld";
import { FIND_FAQS } from "./faq-data";

// /find/page.tsx is a client component ("use client", for useActionState),
// so its metadata — and the FAQPage structured data below, which also
// needs a server context — has to live here instead.
export const metadata: Metadata = {
  title: "Find My Revenue Leaks",
  description:
    // Corrected 2026-08-30: this said "about a minute" — stale since the
    // on-page copy itself was already fixed to the real 10-15 minute
    // figure (DEV-26); the metadata description was missed at the time.
    "Free, about 10-15 minutes: Find reads your existing WhatsApp or Instagram conversations and prices what's sitting there unanswered or unfollowed-up.",
  alternates: { canonical: "/find" },
};

export default function FindLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqJsonLd(FIND_FAQS)) }}
      />
      {children}
    </>
  );
}

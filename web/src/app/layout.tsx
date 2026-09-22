import type { Metadata } from "next";
import { Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Instrument Sans: a modern grotesk with enough character to carry display
// sizes without needing a separate display face. IBM Plex Mono is used ONLY
// for machine-recorded data — currency figures, elapsed time, statuses,
// timestamps. That restriction is the point: in this product, mono means
// "this is a measurement", so it must never be used decoratively.
const sans = Instrument_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const SITE_URL = "https://capture.com.ng";
const SITE_NAME = "Capture";
const DESCRIPTION =
  "Capture helps established Nigerian businesses stop losing sales from delayed DM responses — Engage replies to Instagram and WhatsApp enquiries instantly and escalates anything sensitive to a person, while Find and Recover surface revenue already sitting in your existing conversations.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Capture — Turn more demand into revenue",
    template: "%s — Capture",
  },
  description: DESCRIPTION,
  keywords: [
    "Instagram DM automation",
    "WhatsApp DM automation",
    "instant DM response",
    "customer response time Nigeria",
    "Lagos business automation",
    "WhatsApp lead recovery",
    "revenue leak detection",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Capture — Turn more demand into revenue",
    description: DESCRIPTION,
    locale: "en_NG",
  },
  twitter: {
    card: "summary_large_image",
    title: "Capture — Turn more demand into revenue",
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

// Organization schema, site-wide: gives search engines and LLM answer
// engines (Perplexity, ChatGPT browsing, AI Overviews) an unambiguous
// entity to attach page content to, independent of any one page's copy.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  description: DESCRIPTION,
  areaServed: {
    "@type": "Country",
    name: "Nigeria",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}

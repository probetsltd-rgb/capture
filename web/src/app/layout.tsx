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

export const metadata: Metadata = {
  title: "Capture — Turn more demand into revenue",
  description:
    "Capture helps established businesses find revenue they're leaving on the table, recover dormant opportunities, and prevent new enquiries from going cold.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

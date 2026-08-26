import type { Metadata } from "next";

// /find/page.tsx is a client component ("use client", for useActionState),
// so its metadata has to live here — generateMetadata/metadata aren't
// supported in client components.
export const metadata: Metadata = {
  title: "Find My Revenue Leaks",
  description:
    "Free, in about a minute: Find reads your existing WhatsApp conversations and prices what's sitting there unanswered or unfollowed-up.",
  alternates: { canonical: "/find" },
};

export default function FindLayout({ children }: { children: React.ReactNode }) {
  return children;
}

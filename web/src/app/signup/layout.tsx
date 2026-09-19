import type { Metadata } from "next";

// /signup/page.tsx is a client component ("use client"), so metadata has
// to live here.
export const metadata: Metadata = {
  title: "Try Engage Free",
  description: "Start your 7-day free trial of Capture's Engage — instant Instagram and WhatsApp DM responses.",
  alternates: { canonical: "/signup" },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}

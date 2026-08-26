import type { Metadata } from "next";

// /login/page.tsx is a client component ("use client"), so metadata has to
// live here.
export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Capture account.",
  alternates: { canonical: "/login" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import { AppNav } from "@/components/AppNav";

// Authenticated onboarding flow — never indexable.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <AppNav />
      {children}
    </div>
  );
}

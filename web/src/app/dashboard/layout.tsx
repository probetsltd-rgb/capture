import type { Metadata } from "next";
import { AppNav } from "@/components/AppNav";

// Authenticated, per-business data — never indexable.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <AppNav />
      {children}
    </div>
  );
}

import type { Metadata } from "next";
import { AppNav } from "@/components/AppNav";

// Platform-admin only — never indexable.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <AppNav />
      {children}
    </div>
  );
}

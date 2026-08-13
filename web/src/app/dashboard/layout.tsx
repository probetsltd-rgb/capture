import { AppNav } from "@/components/AppNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <AppNav />
      {children}
    </div>
  );
}

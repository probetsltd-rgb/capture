import { AppNav } from "@/components/AppNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <AppNav />
      {children}
    </div>
  );
}

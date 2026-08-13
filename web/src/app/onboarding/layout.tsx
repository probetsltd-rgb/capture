import { AppNav } from "@/components/AppNav";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <AppNav />
      {children}
    </div>
  );
}

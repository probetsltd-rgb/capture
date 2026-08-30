"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SiteNav, SiteFooter } from "@/components/SiteChrome";
import { EmailCodeForm } from "@/components/EmailCodeForm";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";

  return (
    <div className="shell center-page">
      <EmailCodeForm
        next={next}
        title="Sign in"
        body="We'll email you a 6-digit code. No password to remember."
      />
      <p className="meta" style={{ marginTop: "var(--s6)" }}>
        New to Capture?{" "}
        <Link href="/signup" className="link">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="page">
      <SiteNav />
      <main>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}

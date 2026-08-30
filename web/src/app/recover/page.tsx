import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav, SiteFooter } from "@/components/SiteChrome";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { FaqSection } from "@/components/FaqSection";
import { buildFaqJsonLd } from "@/lib/seo/faq-jsonld";
import { RECOVER_FAQS } from "./faq-data";

export const metadata: Metadata = {
  title: "Recover",
  description:
    "Recover ranks every dormant opportunity in your conversation history, times the outreach, and stops the moment someone replies.",
  alternates: { canonical: "/recover" },
};

// Public, unauthenticated marketing page — same reasoning as the homepage's
// pricing section: read live from `recover_plans` via the service-role
// client so an /admin/recover-plans price edit is never stale here without
// a redeploy.
export const revalidate = 300;

type RecoverPlanRow = {
  id: string;
  display_name: string;
  price_kobo: number;
  lookback_months: number;
};

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

export default async function RecoverPage() {
  const supabase = createServiceRoleClient();
  const { data: plans } = await supabase
    .from("recover_plans")
    .select("id, display_name, price_kobo, lookback_months")
    .order("sort_order", { ascending: true });
  const recoverPlans = (plans ?? []) as RecoverPlanRow[];

  return (
    <div className="page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqJsonLd(RECOVER_FAQS)) }}
      />
      <SiteNav />

      <main>
        <section className="band">
          <div className="shell hero">
            <div className="hero__copy">
              <h1 className="display">Have old leads or customers worth going back to?</h1>
              <p className="lede" style={{ marginTop: "var(--s5)" }}>
                Recover ranks every dormant opportunity in your conversation history, times the
                approach, and stops the moment someone replies.
              </p>
              <div className="row" style={{ marginTop: "var(--s6)", gap: "var(--s4)" }}>
                <Link href="/find" className="btn btn--primary">
                  Start with a free Find audit
                </Link>
              </div>
              <p className="meta" style={{ marginTop: "var(--s5)" }}>
                Recover needs your conversation history to work from — Find is the free, 10–15
                minute audit that brings it in. Already have a report? Sign in and pick a tier
                below.
              </p>
            </div>

            <div className="hero__surface">
              <div className="surface">
                <div className="surface__bar">
                  <span className="surface__title">Recovery — Chinedu M.</span>
                  <span className="badge-demo">Illustrative</span>
                </div>
                <div className="panel__body">
                  <ol className="flow">
                    <FlowStep label="Opportunity identified" note="Quote sent, no follow-up for 6 days" />
                    <FlowStep label="Customer contacted" note="Timed to the opportunity, not a blast" />
                    <FlowStep label="Customer responds" note="Outreach stops automatically" tone="dormant" />
                    <FlowStep label="Revenue recorded" note="₦1,200,000 recovered" tone="realised" />
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="band band--ruled" id="how-it-works">
          <div className="shell">
            <div className="step">
              <span>How Recover works</span>
              <span className="step__line" />
            </div>
            <h2 className="h2">Four real steps, on real history.</h2>

            <ol className="flow" style={{ marginTop: "var(--s6)", maxWidth: "60ch" }}>
              <FlowStep
                label="Opportunity identified"
                note="Every unanswered enquiry, unfollowed-up quote, or lapsed customer, ranked by intent and value."
              />
              <FlowStep
                label="Timed, not blasted"
                note="Capture schedules the approach, capped so nobody gets chased into annoyance."
              />
              <FlowStep
                label="You send it"
                note="No automated WhatsApp sending yet — you send the outreach yourself, Capture tracks status and enforces the limit."
                tone="dormant"
              />
              <FlowStep
                label="Stops on reply"
                note="The moment someone responds, outreach for that opportunity stops automatically."
                tone="realised"
              />
            </ol>
          </div>
        </section>

        {recoverPlans.length > 0 && (
          <section className="band band--ruled band--tint">
            <div className="shell">
              <div className="step">
                <span>Pricing</span>
                <span className="step__line" />
              </div>
              <h2 className="h2">Priced by how much history you want worked.</h2>
              <p className="body" style={{ marginTop: "var(--s3)", maxWidth: "56ch" }}>
                A one-time payment, not a subscription — pick the window once and it&apos;s yours.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "var(--s5)",
                  maxWidth: "760px",
                  marginTop: "var(--s6)",
                }}
              >
                {recoverPlans.map((plan) => (
                  <div
                    key={plan.id}
                    style={{
                      padding: "var(--s5)",
                      border: "1px solid var(--rule)",
                      borderRadius: "var(--radius)",
                      background: "var(--paper)",
                    }}
                  >
                    <h3 className="h3">{plan.display_name}</h3>
                    <p className="mono" style={{ fontSize: "1.5rem", marginTop: "var(--s2)" }}>
                      {formatNaira(plan.price_kobo)}
                    </p>
                    <ul className="meta" style={{ paddingLeft: "1.1rem", marginTop: "var(--s4)" }}>
                      <li>Last {plan.lookback_months} months of conversation history</li>
                      <li>One-time — not a subscription</li>
                    </ul>
                    <Link
                      href="/signup?intent=recover"
                      className="btn btn--secondary btn--block"
                      style={{ marginTop: "var(--s5)" }}
                    >
                      Get started
                    </Link>
                  </div>
                ))}
              </div>
              <p className="meta" style={{ marginTop: "var(--s4)" }}>
                You&apos;ll pick your tier and check out from your dashboard, once you&apos;re
                signed in.
              </p>
            </div>
          </section>
        )}

        <FaqSection heading="Questions people actually ask." faqs={RECOVER_FAQS} />

        <section className="band band--ruled">
          <div className="shell cta">
            <h2 className="h2">Start with the free audit — it&apos;s the first step either way.</h2>
            <p className="body" style={{ marginTop: "var(--s4)" }}>
              Find reads your existing conversations and prices what&apos;s sitting there
              unanswered or unfollowed-up, free. Recover is what you do about it.
            </p>
            <div className="row" style={{ marginTop: "var(--s6)", gap: "var(--s4)" }}>
              <Link href="/find" className="btn btn--primary">
                Find My Revenue Leaks
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function FlowStep({
  label,
  note,
  tone,
}: {
  label: string;
  note: string;
  tone?: "realised" | "dormant";
}) {
  return (
    <li className={`flow__step${tone ? ` flow__step--${tone}` : ""}`}>
      <span className="flow__marker" aria-hidden="true">
        <span className="flow__dot" />
      </span>
      <span>
        <span className="flow__label">{label}</span>
        <span className="flow__note" style={{ display: "block" }}>
          {note}
        </span>
      </span>
    </li>
  );
}

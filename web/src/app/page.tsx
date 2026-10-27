import Link from "next/link";
import { SiteNav, SiteFooter } from "@/components/SiteChrome";
import { ScrollReveal } from "@/components/ScrollReveal";
import { EngageResponseDemo } from "@/components/EngageResponseDemo";
import { FaqSection } from "@/components/FaqSection";
import { buildFaqJsonLd } from "@/lib/seo/faq-jsonld";
import { HOME_FAQS } from "./faq-data";

// Engage-first homepage rebuild (Capture_PRD_Addendum_v2.md §2, §28;
// PLANS.md Phase 5.7) — replaces the previous Find-led version, which
// presented Find/Recover/Engage as three equal, numbered, ordered steps.
// That framing is gone deliberately: Engage is the lead thesis and gets
// the hero + its own explanatory sections; Find and Recover are real,
// independently useful products but now read as invitations ("want to see
// yours?"), not required prerequisites — matching §2's explicit
// instruction that a customer should never need Engage to buy Find or
// Recover, or vice versa. Visual language (bands, the ruled `.surface`
// device, `.flow` step lists, realised/dormant semantic colour, mono for
// machine-recorded numbers) is unchanged from AD-8 — this is a narrative
// restructure within the existing system, not a new one.
//
// 2026-08-25 revision (founder-directed audit): the products strip below
// revives `.products`/`.product` from `globals.css` — CSS left in place
// when the pre-pivot three-equal-steps homepage was deleted in commit
// 1021dc5, never reused since. Same rule applies here as everywhere else
// on this page: `tone` on a `.tag` is reserved for realised/dormant
// *revenue* meaning, so product-status tags below intentionally carry no
// tone — a product being "live" or "from ₦X" isn't a revenue outcome and
// coloring it that way would be exactly the decorative use the CSS
// header comment rules out.
//
export default function Home() {
  // Mirrors only what's actually visible on this page (name, hero
  // description, the 14-day free trial) — structured data must match
  // on-page content, not assert anything the page itself doesn't say.
  const softwareApplicationJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Capture — Engage",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "Engage responds instantly to enquiries wherever they come in, qualifies them, and escalates anything sensitive to a person, while keeping every conversation moving toward an outcome.",
    offers: [
      { "@type": "Offer", description: "14-day free trial", priceCurrency: "NGN", price: "0" },
    ],
  };

  return (
    <div className="page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqJsonLd(HOME_FAQS)) }}
      />
      <ScrollReveal />
      <SiteNav />

      <main>
        {/* ------------------------------------------------------ hero --- */}
        <section className="band">
          <div className="shell hero">
            <div className="hero__copy">
              <h1 className="display">Stop losing sales from delayed DM responses.</h1>
              <p className="lede" style={{ marginTop: "var(--s5)" }}>
                We respond instantly, qualify enquiries and follow up — while keeping your team in
                the loop for anything that needs a person.
              </p>
              <div className="row" style={{ marginTop: "var(--s6)", gap: "var(--s4)" }}>
                <Link href="/signup?intent=engage" className="btn btn--primary">
                  Try Free
                </Link>
                <a href="#how-it-works" className="btn btn--secondary">
                  See how Engage works
                </a>
              </div>
              <p className="meta" style={{ marginTop: "var(--s5)" }}>
                Instagram and WhatsApp, both live. Free for 14 days.
              </p>
            </div>

            <div className="hero__surface">
              <EngageResponseDemo />
            </div>
          </div>
        </section>

        {/* --------------------------------------------- the problem --- */}
        <section className="band band--ink">
          <div className="shell">
            <div className="inbox">
              <h2 className="display" data-reveal>
                Your next customer is already in your inbox.
              </h2>

              <div className="inbox__list" data-reveal data-reveal-delay="100">
                <p className="inbox__item">A DM sitting unread since this morning.</p>
                <p className="inbox__item">A price question nobody has answered yet.</p>
                <p className="inbox__item">A ready buyer who found someone who replied faster.</p>
              </div>

              <p className="inbox__close" data-reveal data-reveal-delay="180">
                Every one of them is demand you already earned.{" "}
                <span style={{ color: "var(--paper)" }}>Engage keeps it moving.</span>
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------- how engage works --- */}
        <section className="band band--ruled" id="how-it-works">
          <div className="shell">
            <div className="step">
              <span>How Engage works</span>
              <span className="step__line" />
            </div>
            <h2 className="h2" data-reveal>
              From enquiry to outcome, five real steps.
            </h2>

            <ol className="flow" data-reveal data-reveal-delay="80" style={{ marginTop: "var(--s6)", maxWidth: "60ch" }}>
              <FlowStep n="01" label="Respond" note="Answered immediately, from information you've explicitly approved — never a guess." />
              <FlowStep n="02" label="Qualify" note="Name, product, timing captured as the conversation naturally gives them up." />
              <FlowStep n="03" label="Escalate" note="Anything sensitive — price negotiation, a complaint, an unusual request — goes straight to a human." />
              <FlowStep n="04" label="Progress" note="Every conversation has a state: handled, waiting on your team, or closed." tone="dormant" />
              <FlowStep n="05" label="Measure" note="What came in, what got answered, what needed a person — as real numbers, not a vibe." tone="realised" />
            </ol>
          </div>
        </section>

        {/* --------------------------------------------------- team role --- */}
        <section className="band band--ruled band--tint">
          <div className="shell cta" data-reveal>
            <h2 className="h2">Engage keeps every conversation moving toward an outcome.</h2>
            <p className="body" style={{ marginTop: "var(--s4)" }}>
              Your team stays in the loop for anything that needs a person. The goal was never to
              take your team out of the conversation. It&apos;s to make sure every conversation
              keeps moving toward an answer — automatically where that&apos;s safe, by a person
              where it isn&apos;t. And when something does escalate, it reaches your team, not just
              whoever happens to be watching the dashboard.
            </p>
          </div>
        </section>

        {/* ---------------------------------------------- products strip --- */}
        <section className="band band--ruled" id="products">
          <div className="shell">
            <h2 className="h2" data-reveal>
              Three ways Capture puts revenue back in view.
            </h2>

            <div className="products" data-reveal data-reveal-delay="80">
              <ProductRow
                n="01"
                name="Engage"
                what="Responds to new enquiries instantly, qualifies them, and escalates anything that needs a person."
                status="Live on Instagram and WhatsApp"
                href="/signup?intent=engage"
                cta="Try Engage Free"
              />
              <ProductRow
                n="02"
                name="Find"
                what="A free, priced report on the revenue sitting in conversations you already have."
                status="Free · about 10–15 minutes"
                href="/find"
                cta="Find My Revenue Leaks"
              />
              <ProductRow
                n="03"
                name="Recover"
                what="Ranks your dormant leads, times the outreach, and stops the moment someone replies."
                status="Priced by history window · you send the outreach"
                href="/recover"
                cta="Explore Recover"
              />
            </div>
          </div>
        </section>

        {/* ---------------------------------------------- fourteen-day proof --- */}
        <section className="band band--ruled">
          <div className="shell split">
            <div className="split__copy" data-reveal>
              <div className="step">
                <span>Fourteen-day proof</span>
                <span className="step__line" />
              </div>
              <h2 className="h2">See it work before you commit to it.</h2>
              <p className="body" style={{ marginTop: "var(--s4)" }}>
                Connect Instagram and Engage builds a baseline from your last 30 days — real
                conversations, real gaps, not a guess. WhatsApp connects too, starting fresh from
                day one. Ten days into your trial, you get a progress report comparing what
                changed.
              </p>
              <p className="body" style={{ marginTop: "var(--s4)" }}>
                Only numbers we can actually measure. No invented revenue figures.
              </p>
            </div>

            <div className="split__surface" data-reveal data-reveal-delay="120">
              <div className="surface">
                <div className="surface__bar">
                  <span className="surface__title">Day 10 of 14</span>
                  <span className="badge-demo">Illustrative</span>
                </div>
                <div className="panel__body">
                  <div className="stat-row">
                    <span className="stat-row__label">Conversations received</span>
                    <span className="stat-row__value">63</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row__label">Answered within a minute</span>
                    <span className="stat-row__value realised">49</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row__label">Escalated to your team</span>
                    <span className="stat-row__value">9</span>
                  </div>
                  <div className="stat-row stat-row--lead">
                    <span className="stat-row__label">Response time, before → with Engage</span>
                    <span className="stat-row__value">
                      <span className="dormant">47 min</span> → <span className="realised">38 sec</span>
                    </span>
                  </div>
                </div>
              </div>
              <p className="meta" style={{ marginTop: "var(--s3)" }}>
                4 days left in your trial.
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- why capture --- */}
        <section className="band band--ruled band--tint">
          <div className="shell">
            <h2 className="h2" data-reveal>
              Why Capture.
            </h2>

            <div
              data-reveal
              data-reveal-delay="80"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "var(--s6)",
                marginTop: "var(--s6)",
              }}
            >
              <WhyItem
                title="Never guesses"
                body="Every reply comes only from knowledge you've explicitly approved. Anything else — or anything sensitive — goes to a person, not a best-effort answer."
              />
              <WhyItem
                title="Reaches the right people"
                body="An escalation reaches your team by email, and by WhatsApp too for anyone who's added a number, in priority order — not one inbox that has to happen to be watching."
              />
              <WhyItem
                title="Starts from what already happened"
                body="Your first week runs against a real 30-day baseline built from your own history, not a cold start."
              />
              <WhyItem
                title="Only numbers you can measure"
                body="No invented revenue figures, anywhere on this site or in your dashboard — including the demos above."
              />
            </div>
          </div>
        </section>

        <FaqSection heading="Questions people actually ask." faqs={HOME_FAQS} />

        {/* ------------------------------------------------------- cta --- */}
        <section className="band band--ruled band--ink">
          <div className="shell cta" data-reveal>
            <h2 className="h2">You already have the enquiries. Stop losing them.</h2>
            <p className="lede" style={{ marginTop: "var(--s4)" }}>
              Try Engage free for 14 days — no card needed.
            </p>
            <div className="row" style={{ marginTop: "var(--s6)", gap: "var(--s4)" }}>
              <Link href="/signup?intent=engage" className="btn btn--primary">
                Try Engage Free
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
  n,
  label,
  note,
  tone,
}: {
  n?: string;
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
        <span className="flow__label">
          {n && <span className="mono" style={{ color: "var(--ink-3)", marginRight: "var(--s2)" }}>{n}</span>}
          {label}
        </span>
        <span className="flow__note" style={{ display: "block" }}>
          {note}
        </span>
      </span>
    </li>
  );
}

function ProductRow({
  n,
  name,
  what,
  status,
  href,
  cta,
}: {
  n: string;
  name: string;
  what: string;
  status: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="product">
      <span className="product__n mono">{n}</span>
      <div className="product__main">
        <h3 className="h3">{name}</h3>
        <p className="body" style={{ marginTop: "var(--s2)" }}>
          {what}
        </p>
        <span className="tag" style={{ color: "var(--ink-3)", border: "1px solid var(--rule)" }}>
          {status}
        </span>
      </div>
      <Link href={href} className="btn btn--secondary product__cta">
        {cta}
      </Link>
    </div>
  );
}

function WhyItem({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="h3">{title}</h3>
      <p className="body" style={{ marginTop: "var(--s2)" }}>
        {body}
      </p>
    </div>
  );
}

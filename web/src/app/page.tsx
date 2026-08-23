import Link from "next/link";
import { SiteNav, SiteFooter } from "@/components/SiteChrome";
import { ScrollReveal } from "@/components/ScrollReveal";
import { RevenueLedger } from "@/components/RevenueLedger";
import { EngageResponseDemo } from "@/components/EngageResponseDemo";

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
export default function Home() {
  return (
    <div className="page">
      <ScrollReveal />
      <SiteNav />

      <main>
        {/* ------------------------------------------------------ hero --- */}
        <section className="band">
          <div className="shell hero">
            <div className="hero__copy">
              <h1 className="display">Stop losing money from delayed DM responses.</h1>
              <p className="lede" style={{ marginTop: "var(--s5)" }}>
                We respond instantly, qualify enquiries and follow up — while keeping your team in
                the loop for anything that needs a person.
              </p>
              <div className="row" style={{ marginTop: "var(--s6)", gap: "var(--s4)" }}>
                <Link href="/signup" className="btn btn--primary">
                  Try Free
                </Link>
                <a href="#how-it-works" className="btn btn--secondary">
                  See how Engage works
                </a>
              </div>
              <p className="meta" style={{ marginTop: "var(--s5)" }}>
                Instagram today, WhatsApp coming soon. Free for 7 days.
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
                Every enquiry that waits is revenue that walks.
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
              One conversation, five real steps.
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
            <h2 className="h2">Engage handles the volume. Your team handles what matters.</h2>
            <p className="body" style={{ marginTop: "var(--s4)" }}>
              The goal was never to take your team out of the conversation. It&apos;s to make sure
              every conversation keeps moving toward an answer — automatically where that&apos;s
              safe, by a person where it isn&apos;t.
            </p>
          </div>
        </section>

        {/* ---------------------------------------------- seven-day proof --- */}
        <section className="band band--ruled">
          <div className="shell split">
            <div className="split__copy" data-reveal>
              <div className="step">
                <span>Seven-day proof</span>
                <span className="step__line" />
              </div>
              <h2 className="h2">See it work before you commit to it.</h2>
              <p className="body" style={{ marginTop: "var(--s4)" }}>
                Connect Instagram and Engage builds a baseline from your last 30 days — real
                conversations, real gaps, not a guess. Five days into your trial, you get a
                progress report comparing what changed.
              </p>
              <p className="body" style={{ marginTop: "var(--s4)" }}>
                Only numbers we can actually measure. No invented revenue figures.
              </p>
            </div>

            <div className="split__surface" data-reveal data-reveal-delay="120">
              <div className="surface">
                <div className="surface__bar">
                  <span className="surface__title">Day 5 of 7</span>
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
                2 days left in your trial.
              </p>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- find cta --- */}
        <section className="band band--ruled band--tint" id="find">
          <div className="shell split">
            <div className="split__copy" data-reveal>
              <h2 className="h2">Want to see where you&apos;re already losing revenue?</h2>
              <p className="body" style={{ marginTop: "var(--s4)" }}>
                Find reads your existing conversations and prices what&apos;s sitting there
                unanswered or unfollowed-up. Free, and it doesn&apos;t require Engage.
              </p>
              <Link href="/find" className="btn btn--secondary" style={{ marginTop: "var(--s5)" }}>
                Find My Revenue Leaks
              </Link>
            </div>

            <div className="split__surface" data-reveal data-reveal-delay="120">
              <RevenueLedger />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ recover cta --- */}
        <section className="band band--ruled" id="recover">
          <div className="shell split split--reverse">
            <div className="split__copy" data-reveal>
              <h2 className="h2">Have old leads or customers worth going back to?</h2>
              <p className="body" style={{ marginTop: "var(--s4)" }}>
                Recover ranks every dormant opportunity, times the approach, and stops the moment
                someone replies. Also independent of Engage.
              </p>
              <Link href="/signup" className="btn btn--secondary" style={{ marginTop: "var(--s5)" }}>
                Explore Recover
              </Link>
            </div>

            <div className="split__surface" data-reveal data-reveal-delay="120">
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

        {/* ------------------------------------------------------- cta --- */}
        <section className="band band--ruled band--tint">
          <div className="shell cta" data-reveal>
            <h2 className="h2">Stop losing money from delayed DM responses.</h2>
            <p className="lede" style={{ marginTop: "var(--s4)" }}>
              Try Engage free for 7 days.
            </p>
            <div className="row" style={{ marginTop: "var(--s6)", gap: "var(--s4)" }}>
              <Link href="/signup" className="btn btn--primary">
                Try Engage Free
              </Link>
              <Link href="/login" className="btn btn--secondary">
                Sign in
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

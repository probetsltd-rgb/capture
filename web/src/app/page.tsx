import Link from "next/link";
import { SiteNav, SiteFooter } from "@/components/SiteChrome";
import { ScrollReveal } from "@/components/ScrollReveal";
import { RevenueLedger } from "@/components/RevenueLedger";

export default function Home() {
  return (
    <div className="page">
      <ScrollReveal />
      <SiteNav />

      <main>
        {/* ------------------------------------------------------ hero --- */}
        <section className="band">
          {/* No reveal on the hero: content that is already in view must not
              fade in — it costs perceived speed and reads as decoration. The
              ledger's own sequence is the one intentional motion moment. */}
          <div className="shell hero">
            <div className="hero__copy">
              <h1 className="display">Turn more demand into revenue.</h1>
              <p className="lede" style={{ marginTop: "var(--s5)" }}>
                Capture helps established businesses find revenue they&apos;re leaving on the
                table, recover dormant opportunities, and prevent new enquiries from going cold.
              </p>
              <div className="row" style={{ marginTop: "var(--s6)", gap: "var(--s4)" }}>
                <Link href="/find" className="btn btn--primary">
                  Find My Revenue Leaks — Free
                </Link>
                <a href="#find" className="btn btn--secondary">
                  See how Capture works
                </a>
              </div>
              <p className="meta" style={{ marginTop: "var(--s5)" }}>
                No integration required. Upload a sample of your WhatsApp conversations and get a
                priced report back.
              </p>
            </div>

            <div className="hero__surface">
              <RevenueLedger />
            </div>
          </div>
        </section>

        {/* ------------------------------------- editorial: the inbox --- */}
        <section className="band band--ink">
          <div className="shell">
            <div className="inbox">
              <h2 className="display" data-reveal>
                Your next customer may already be in your inbox.
              </h2>

              <div className="inbox__list" data-reveal data-reveal-delay="100">
                <p className="inbox__item">An enquiry nobody replied to.</p>
                <p className="inbox__item">A quote that never got followed up.</p>
                <p className="inbox__item">A buyer who went quiet three weeks ago.</p>
                <p className="inbox__item">A customer who bought once and was never contacted again.</p>
              </div>

              <p className="inbox__close" data-reveal data-reveal-delay="180">
                Every one of them is demand you already paid to create.{" "}
                <span style={{ color: "var(--paper)" }}>Capture finds and fixes the gap.</span>
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- 01 FIND ----- */}
        <section className="band band--ruled" id="find">
          <div className="shell split">
            <div className="split__copy" data-reveal>
              <div className="step">
                <span className="step__n">01</span>
                <span>Find</span>
                <span className="step__line" />
              </div>
              <h2 className="h2">Find the revenue you&apos;re already losing.</h2>
              <p className="body" style={{ marginTop: "var(--s4)" }}>
                Capture reads your existing customer conversations and classifies what happened in
                each one — who was ready to buy, who never got a reply, which quotes died quietly.
                You get a priced report, not a dashboard to interpret.
              </p>
              <p className="body" style={{ marginTop: "var(--s4)" }}>
                It&apos;s free, and it runs on conversations you already have.
              </p>
              <Link
                href="/find"
                className="btn btn--secondary"
                style={{ marginTop: "var(--s5)" }}
              >
                Run a free audit
              </Link>
            </div>

            <div className="split__surface" data-reveal data-reveal-delay="120">
              <div className="surface">
                <div className="surface__bar">
                  <span className="surface__title">Audit summary</span>
                  <span className="badge-demo">Illustrative</span>
                </div>
                <div className="panel__body">
                  <div className="stat-row">
                    <span className="stat-row__label">Conversations analysed</span>
                    <span className="stat-row__value">47</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row__label">Enquiries with no response</span>
                    <span className="stat-row__value dormant">7</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row__label">High intent, no follow-up</span>
                    <span className="stat-row__value dormant">8</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row__label">Quotes never followed up</span>
                    <span className="stat-row__value dormant">4</span>
                  </div>
                  <div className="stat-row stat-row--lead">
                    <span className="stat-row__label">Potential opportunity</span>
                    <span className="stat-row__value realised">₦3,240,000</span>
                  </div>
                </div>
              </div>
              <p className="meta" style={{ marginTop: "var(--s3)" }}>
                Estimated opportunity value is not a revenue guarantee.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------- 02 RECOVER ----- */}
        <section className="band band--ruled" id="recover">
          <div className="shell split split--reverse">
            <div className="split__copy" data-reveal>
              <div className="step">
                <span className="step__n">02</span>
                <span>Recover</span>
                <span className="step__line" />
              </div>
              <h2 className="h2">Recover what went cold.</h2>
              <p className="body" style={{ marginTop: "var(--s4)" }}>
                Capture ranks every dormant opportunity by intent and value, decides when each one
                should be approached, and tracks it through to an outcome you can put a number on.
              </p>
              <p className="body" style={{ marginTop: "var(--s4)" }}>
                One follow-up, then it stops. The moment a customer replies, outreach ends and the
                conversation belongs to your team.
              </p>
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
                    <FlowStep label="Priority scored" note="High intent · ₦1,200,000" />
                    <FlowStep label="Customer contacted" note="Timed to the opportunity, not a blast" />
                    <FlowStep label="Customer responds" note="Outreach stops automatically" tone="dormant" />
                    <FlowStep label="Handed to your team" note="A person closes it, not a bot" />
                    <FlowStep label="Revenue recorded" note="₦1,200,000 recovered" tone="realised" />
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------- 03 PREVENT ----- */}
        <section className="band band--ruled" id="prevent">
          <div className="shell split">
            <div className="split__copy" data-reveal>
              <div className="step">
                <span className="step__n">03</span>
                <span>Prevent</span>
                <span className="step__line" />
              </div>
              <h2 className="h2">Stop new enquiries from going cold.</h2>
              <p className="body" style={{ marginTop: "var(--s4)" }}>
                Every enquiry gets an immediate answer, drawn strictly from information you have
                approved. Capture never improvises on price, policy or availability.
              </p>
              <p className="body" style={{ marginTop: "var(--s4)" }}>
                Anything sensitive — a complaint, a negotiation, an unusual request — goes to a
                human. The moment someone takes over, the automation stops mid-conversation.
              </p>
            </div>

            <div className="split__surface" data-reveal data-reveal-delay="120">
              <div className="surface">
                <div className="surface__bar">
                  <span className="surface__title">Live enquiry</span>
                  <span className="badge-demo">Illustrative</span>
                </div>
                <div className="panel__body">
                  <ol className="flow">
                    <FlowStep label="Enquiry arrives" note="&ldquo;Do you deliver to Ikeja on Saturday?&rdquo;" />
                    <FlowStep label="Answered in seconds" note="From approved delivery information only" />
                    <FlowStep label="Intent detected" note="High intent · asked about a specific date" />
                    <FlowStep label="Details captured" note="Name, location, delivery date" />
                    <FlowStep label="Escalated to a human" note="Asked for a discount — outside approved terms" tone="dormant" />
                    <FlowStep label="Sale closed by your team" note="Nothing was left waiting" tone="realised" />
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------- the commercial thesis --- */}
        <section className="band band--ruled">
          <div className="shell">
            <div className="thesis" data-reveal>
              <div className="thesis__half">
                <h2 className="h2">Recover clears the backlog.</h2>
                <p className="body" style={{ marginTop: "var(--s3)" }}>
                  Every opportunity already sitting in your history, worked once, properly.
                </p>
              </div>
              <div className="thesis__rule" aria-hidden="true" />
              <div className="thesis__half">
                <h2 className="h2">Prevent stops it coming back.</h2>
                <p className="body" style={{ marginTop: "var(--s3)" }}>
                  New demand gets answered the day it arrives, so the backlog never rebuilds.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ----------------------------------------- product hierarchy --- */}
        <section className="band band--ruled">
          <div className="shell">
            <h2 className="h2" data-reveal>
              Three products, in the order you need them.
            </h2>

            <div className="products" data-reveal data-reveal-delay="80">
              <ProductRow
                n="01"
                name="Find"
                what="A priced report on the revenue sitting in conversations you already have."
                status="Free · available now"
                tone="realised"
                href="/find"
                cta="Run a free audit"
              />
              <ProductRow
                n="02"
                name="Recover"
                what="Work the backlog. Capture finds, scores and schedules every opportunity; your team sends the outreach."
                status="Available now · you send the messages"
                href="/signup"
                cta="Set up Recover"
              />
              <ProductRow
                n="03"
                name="Prevent"
                what="Answer new demand instantly, qualify it, and escalate anything that needs a person."
                status="Configure now · live channel connection in progress"
                tone="dormant"
                href="/signup"
                cta="Set up Prevent"
              />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- cta --- */}
        <section className="band band--ruled">
          <div className="shell cta" data-reveal>
            <h2 className="h2">Start with the number.</h2>
            <p className="lede" style={{ marginTop: "var(--s4)" }}>
              Run the free audit on a sample of your conversations. If there&apos;s nothing there,
              you&apos;ve lost an afternoon. If there is, you&apos;ll know exactly what it&apos;s
              worth.
            </p>
            <div className="row" style={{ marginTop: "var(--s6)", gap: "var(--s4)" }}>
              <Link href="/find" className="btn btn--primary">
                Find My Revenue Leaks — Free
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

function ProductRow({
  n,
  name,
  what,
  status,
  tone,
  href,
  cta,
}: {
  n: string;
  name: string;
  what: string;
  status: string;
  tone?: "realised" | "dormant";
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
        <span className={`tag ${tone === "realised" ? "tag--realised" : tone === "dormant" ? "tag--dormant" : ""}`}
          style={tone ? undefined : { color: "var(--ink-3)", border: "1px solid var(--rule)" }}>
          {status}
        </span>
      </div>
      <Link href={href} className="btn btn--secondary product__cta">
        {cta}
      </Link>
    </div>
  );
}

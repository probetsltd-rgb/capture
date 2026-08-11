"use client";

import { useEffect, useRef } from "react";

// The signature product surface: a ruled record of conversations that went
// quiet, priced. The leak labels are the real taxonomy the classifier emits
// (see conversations.leakage_type), and the rows sum exactly to the total —
// so the demo holds up if a visitor actually adds it up.
const ROWS = [
  { who: "Adaeze O.", silent: "11 days", leak: "No response", value: 450_000 },
  { who: "Chinedu M.", silent: "6 days", leak: "Quote not followed up", value: 1_200_000 },
  { who: "Funmi A.", silent: "23 days", leak: "High intent, went cold", value: 680_000 },
  { who: "Tobi E.", silent: "9 days", leak: "No response", value: 310_000 },
  { who: "Halima B.", silent: "31 days", leak: "Previous customer", value: 600_000 },
];

const TOTAL = ROWS.reduce((sum, r) => sum + r.value, 0);

function naira(value: number): string {
  return `₦${value.toLocaleString("en-NG")}`;
}

export function RevenueLedger() {
  const root = useRef<HTMLDivElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);

  // Deliberately *not* React state. The markup below renders complete and
  // final — every row visible, total already at its value — so the hero is
  // correct with JS disabled, mid-hydration, or if anything below fails.
  // The animation only ever subtracts from that: it hides the rows on mount
  // and plays them back in. A blank ledger showing ₦0 is the worst thing
  // this component could put in the hero, so no code path can produce it.
  useEffect(() => {
    const el = root.current;
    const totalEl = totalRef.current;
    if (!el || !totalEl) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const rows = Array.from(el.querySelectorAll<HTMLElement>(".ledger__row"));
    el.classList.add("ledger--armed");

    let raf = 0;
    const timers: number[] = [];
    let done = false;

    const play = () => {
      if (done) return;
      done = true;

      rows.forEach((row, i) => {
        timers.push(window.setTimeout(() => row.classList.add("is-in"), 260 + i * 130));
      });

      timers.push(
        window.setTimeout(
          () => {
            const duration = 900;
            const start = performance.now();
            const tick = (now: number) => {
              const p = Math.min((now - start) / duration, 1);
              totalEl.textContent = naira(Math.round(TOTAL * (1 - Math.pow(1 - p, 3))));
              if (p < 1) raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
          },
          260 + rows.length * 130,
        ),
      );
    };

    // Safety net: a throttled background tab never gives IntersectionObserver
    // a rendering opportunity, so without this the ledger could sit hidden
    // indefinitely. Whatever happens, it plays.
    timers.push(window.setTimeout(play, 2500));

    let observer: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            play();
            observer?.disconnect();
          }
        },
        { threshold: 0.25 },
      );
      observer.observe(el);
    } else {
      play();
    }

    return () => {
      observer?.disconnect();
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="surface">
      <div className="surface__bar">
        <span className="surface__title">Revenue Leak Report</span>
        <span className="badge-demo">Illustrative</span>
      </div>

      <div className="ledger" ref={root}>
        <div className="ledger__head" aria-hidden="true">
          <span>Conversation · silent for</span>
          <span className="num">Opportunity</span>
        </div>

        <ol style={{ display: "contents" }}>
          {ROWS.map((row) => (
            <li key={row.who} className="ledger__row">
              <span className="ledger__left">
                <span className="ledger__who">{row.who}</span>
                <span className="ledger__sub">
                  <span className="mono">{row.silent}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tag tag--dormant">{row.leak}</span>
                </span>
              </span>
              <span className="mono num ledger__val">{naira(row.value)}</span>
            </li>
          ))}
        </ol>

        <div className="ledger__total">
          <span>
            Potentially recoverable
            <span className="ledger__sub" style={{ fontWeight: 400 }}>
              from 47 conversations analysed
            </span>
          </span>
          <span className="mono num ledger__val realised" ref={totalRef}>
            {naira(TOTAL)}
          </span>
        </div>
      </div>
    </div>
  );
}

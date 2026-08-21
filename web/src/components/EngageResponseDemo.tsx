"use client";

import { useEffect, useRef, useState } from "react";

// The hero's signature moment for the Engage-first homepage (PLANS.md
// Phase 5.7). Deliberately a different motion idiom from RevenueLedger's
// "count up to a fixed total" — that fits Find's thesis (accumulated,
// static value sitting in old conversations). Engage's thesis is speed, so
// this counts up in real time, live, then stops — the clock itself is the
// argument. ANSWER_AFTER_MS is short enough to land within a hero's actual
// attention span, not a claim about typical response time (that's the
// separate, explicitly-labeled comparison stat below it).
const ANSWER_AFTER_MS = 2400;
const STATIC_ELAPSED_LABEL = "2.4s"; // shown with JS disabled / reduced motion — must match a real run closely enough not to lie

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function EngageResponseDemo() {
  // Renders answered-and-settled by default, same principle as
  // RevenueLedger: no code path may show an unanswered enquiry sitting
  // there mid-load, since that's the exact failure mode this product
  // exists to prevent.
  const [answered, setAnswered] = useState(false);
  const [elapsedLabel, setElapsedLabel] = useState(STATIC_ELAPSED_LABEL);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAnswered(true);
      return;
    }

    setAnswered(false);
    startRef.current = performance.now();

    const tick = (now: number) => {
      const start = startRef.current;
      if (start === null) return;
      const elapsed = now - start;
      if (elapsed >= ANSWER_AFTER_MS) {
        setElapsedLabel(formatElapsed(ANSWER_AFTER_MS));
        setAnswered(true);
        return;
      }
      setElapsedLabel(formatElapsed(elapsed));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="surface">
      <div className="surface__bar">
        <span className="surface__title">Instagram DM</span>
        <span className="badge-demo">Illustrative</span>
      </div>
      <div className="panel__body">
        <ol className="flow">
          <li className="flow__step">
            <span className="flow__marker" aria-hidden="true">
              <span className="flow__dot" />
            </span>
            <span>
              <span className="flow__label">Enquiry arrives</span>
              <span className="flow__note" style={{ display: "block" }}>
                &ldquo;Is the Prado still available this weekend?&rdquo;
              </span>
            </span>
          </li>
          <li className={`flow__step${answered ? " flow__step--realised" : ""}`}>
            <span className="flow__marker" aria-hidden="true">
              <span className="flow__dot" />
            </span>
            <span>
              <span className="flow__label">
                {answered ? "Answered" : "Answering…"}{" "}
                <span className="mono" style={{ color: "var(--ink-2)", fontWeight: 400 }}>
                  {elapsedLabel}
                </span>
              </span>
              {answered && (
                <span className="flow__note" style={{ display: "block" }}>
                  &ldquo;Yes — pickup Saturday morning, back Monday. Want me to hold it?&rdquo;
                </span>
              )}
            </span>
          </li>
        </ol>

        <div className="stat-row" style={{ marginTop: "var(--s4)" }}>
          <span className="stat-row__label">Typical reply time without Engage</span>
          <span className="stat-row__value dormant">47 min</span>
        </div>
        <div className="stat-row stat-row--lead">
          <span className="stat-row__label">With Engage</span>
          <span className="stat-row__value realised">{elapsedLabel}</span>
        </div>
      </div>
    </div>
  );
}

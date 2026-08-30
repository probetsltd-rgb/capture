import type { FaqItem } from "@/lib/seo/faq-jsonld";

// Plain <details>/<summary> — same expand/collapse idiom already used for
// the upload page's skipped-file list, not a new custom accordion widget.
export function FaqSection({ heading, faqs }: { heading: string; faqs: FaqItem[] }) {
  return (
    <section className="band band--ruled" id="faq">
      <div className="shell">
        <div className="step">
          <span>FAQ</span>
          <span className="step__line" />
        </div>
        <h2 className="h2">{heading}</h2>

        <div style={{ marginTop: "var(--s6)", maxWidth: "68ch" }}>
          {faqs.map((item, i) => (
            <details
              key={item.question}
              style={{
                borderBottom: i < faqs.length - 1 ? "1px solid var(--rule)" : undefined,
                padding: "var(--s4) 0",
              }}
            >
              <summary className="h3" style={{ cursor: "pointer" }}>
                {item.question}
              </summary>
              <p className="body" style={{ marginTop: "var(--s3)" }}>
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

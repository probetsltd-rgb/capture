import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 1.5rem", fontFamily: "sans-serif", lineHeight: 1.6 }}>
      <section style={{ textAlign: "center", marginBottom: "3rem" }}>
        <h1 style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>Turn more demand into revenue.</h1>
        <p style={{ fontSize: "1.1rem", color: "#444" }}>
          Capture helps established businesses find revenue they&apos;re leaving on the table,
          recover dormant opportunities, and prevent new enquiries from going cold.
        </p>
        <Link
          href="/find"
          style={{
            display: "inline-block",
            marginTop: "1.5rem",
            padding: "0.8rem 1.6rem",
            background: "#111",
            color: "#fff",
            textDecoration: "none",
            borderRadius: "4px",
            fontWeight: 600,
          }}
        >
          Find My Revenue Leaks — Free
        </Link>
        <p style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </section>

      <section style={{ marginBottom: "3rem" }}>
        <h2>Your next customer might already be in your inbox.</h2>
        <p>
          A customer asks a question. Your business responds. The customer goes quiet. No
          follow-up happens. The opportunity is lost — and it happens more often than most
          businesses realise.
        </p>
        <p style={{ fontWeight: 600 }}>Capture finds and fixes the gap.</p>
      </section>

      <section style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div>
          <h3>Find</h3>
          <p>See where revenue opportunities are falling through the cracks.</p>
          <p style={{ color: "#888", fontSize: "0.8rem", fontWeight: 600 }}>Free, self-serve</p>
        </div>
        <div>
          <h3>Recover</h3>
          <p>Recover dormant leads, customers, and opportunities.</p>
          <p style={{ color: "#888", fontSize: "0.8rem", fontWeight: 600 }}>
            Available now — Capture finds and scores the opportunities, you handle the outreach.{" "}
            <Link href="/signup">Set up Recover →</Link>
          </p>
        </div>
        <div>
          <h3>Prevent</h3>
          <p>Stop new enquiries from going cold.</p>
          <p style={{ color: "#888", fontSize: "0.8rem", fontWeight: 600 }}>
            Live automated responses are coming, pending WhatsApp/Instagram access — you can set
            up your knowledge base now. <Link href="/signup">Set up Prevent →</Link>
          </p>
        </div>
      </section>

      <section style={{ marginTop: "3rem", textAlign: "center", color: "#666", fontSize: "0.9rem" }}>
        <p>
          Find is free and fully self-serve. Recover is available today as a guided workflow — no
          messaging automation yet, so you send the actual outreach yourself. Prevent&apos;s
          knowledge base and rules can be configured now; it can&apos;t yet respond to real
          customers until a WhatsApp/Instagram connection is live.
        </p>
      </section>
    </main>
  );
}

import Link from "next/link";

export function SiteNav() {
  return (
    <header className="nav">
      <div className="shell nav__inner">
        <Link href="/" className="nav__brand">
          Capture
        </Link>

        <nav className="nav__links" aria-label="Primary">
          <Link className="nav__link" href="/#find">
            Find
          </Link>
          <Link className="nav__link" href="/#recover">
            Recover
          </Link>
          <Link className="nav__link" href="/#prevent">
            Prevent
          </Link>
        </nav>

        <div className="nav__actions">
          <Link href="/login" className="nav__link">
            Sign in
          </Link>
          <Link href="/find" className="btn btn--primary">
            Run a free audit
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="shell footer__inner">
        <div>
          <div className="nav__brand">Capture</div>
          <p className="meta" style={{ marginTop: "var(--s1)" }}>
            Turn more demand into revenue.
          </p>
        </div>
        <nav className="footer__links" aria-label="Footer">
          <Link href="/find">Run a free audit</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/privacy">Privacy &amp; data handling</Link>
        </nav>
      </div>
    </footer>
  );
}

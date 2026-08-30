"use client";

import { useActionState } from "react";
import Link from "next/link";
import { SiteNav, SiteFooter } from "@/components/SiteChrome";
import { FaqSection } from "@/components/FaqSection";
import { submitIntake, type IntakeState } from "./actions";
import {
  INDUSTRIES,
  REVENUE_BUCKETS,
  CONVERSATION_VOLUME_BUCKETS,
} from "./constants";
import { FIND_FAQS } from "./faq-data";

const initialState: IntakeState = { status: "idle", message: null };

export default function FindPage() {
  const [state, formAction, pending] = useActionState(submitIntake, initialState);

  if (state.status === "success") {
    return (
      <div className="page">
        <SiteNav />
        <main>
          <div className="shell center-page stack--lg" style={{ display: "grid" }}>
            <div>
              <h1 className="h2">You&apos;re in.</h1>
              <p className="body" style={{ marginTop: "var(--s4)" }}>
                {state.message}
              </p>
            </div>
            {state.uploadUrl && (
              <Link href={state.uploadUrl} className="btn btn--primary">
                Upload my conversations
              </Link>
            )}
            <Link href="/" className="btn btn--ghost">
              ← Back to home
            </Link>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="page">
      <SiteNav />

      <main>
        <div className="shell band">
          <div className="intake">
            <div className="intake__aside">
              <h1 className="h2">Find My Revenue Leaks</h1>
              <p className="body" style={{ marginTop: "var(--s4)" }}>
                Free, always — about 10–15 minutes start to finish. Next we&apos;ll collect a
                sample of your WhatsApp conversations and send back a priced report showing where
                enquiries went unanswered or cold.
              </p>
              <p className="meta" style={{ marginTop: "var(--s3)" }}>
                This audit is also the first step into Recover, if you want us to start working
                through what we find.
              </p>

              <ol className="flow" style={{ marginTop: "var(--s6)" }}>
                <li className="flow__step">
                  <span className="flow__marker" aria-hidden="true">
                    <span className="flow__dot" />
                  </span>
                  <span>
                    <span className="flow__label">Tell us about your business</span>
                    <span className="flow__note" style={{ display: "block" }}>
                      About a minute
                    </span>
                  </span>
                </li>
                <li className="flow__step">
                  <span className="flow__marker" aria-hidden="true">
                    <span className="flow__dot" />
                  </span>
                  <span>
                    <span className="flow__label">Upload a conversation export</span>
                    <span className="flow__note" style={{ display: "block" }}>
                      Exported from WhatsApp, no integration needed
                    </span>
                  </span>
                </li>
                <li className="flow__step flow__step--realised">
                  <span className="flow__marker" aria-hidden="true">
                    <span className="flow__dot" />
                  </span>
                  <span>
                    <span className="flow__label">Get your Revenue Leak Report</span>
                    <span className="flow__note" style={{ display: "block" }}>
                      Counts, examples and an opportunity value
                    </span>
                  </span>
                </li>
              </ol>
            </div>

            <div className="intake__form">
              <form action={formAction} className="form">
                {/* Honeypot — hidden from real users via CSS, not `type="hidden"`
                    (some bots skip those), never sent a value by a human. */}
                <div style={{ position: "absolute", left: "-9999px" }} aria-hidden="true">
                  <label htmlFor="website_url">Leave this field blank</label>
                  <input type="text" id="website_url" name="website_url" tabIndex={-1} autoComplete="off" />
                </div>

                <Field label="Business name">
                  <input type="text" name="business_name" required maxLength={200} className="input" />
                </Field>

                <Field label="Industry">
                  <select name="industry" required defaultValue="" className="input">
                    <option value="" disabled>
                      Select one
                    </option>
                    {INDUSTRIES.map((i) => (
                      <option key={i.value} value={i.value}>
                        {i.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Website or Instagram" hint="Optional">
                  <input type="text" name="website_or_instagram" className="input" />
                </Field>

                <Field label="Approximate annual revenue">
                  <select name="revenue_bucket" required defaultValue="" className="input">
                    <option value="" disabled>
                      Select one
                    </option>
                    {REVENUE_BUCKETS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Approximate monthly WhatsApp conversations">
                  <select name="volume_bucket" required defaultValue="" className="input">
                    <option value="" disabled>
                      Select one
                    </option>
                    {CONVERSATION_VOLUME_BUCKETS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Contact email">
                  <input type="email" name="contact_email" required className="input" />
                </Field>

                <Field label="WhatsApp number" hint="Optional">
                  <input type="tel" name="contact_phone" className="input" />
                </Field>

                <label className="checkbox">
                  <input type="checkbox" name="consent" required />
                  <span>
                    I agree to Capture&apos;s{" "}
                    <Link href="/privacy" className="link">
                      Privacy &amp; Data Handling
                    </Link>{" "}
                    terms, including analysis of the WhatsApp conversations I&apos;ll provide for
                    this audit.
                  </span>
                </label>

                {state.status === "error" && (
                  <p className="notice notice--error">{state.message}</p>
                )}

                <button type="submit" disabled={pending} className="btn btn--primary btn--block">
                  {pending ? "Submitting…" : "Get my Revenue Leak Report"}
                </button>
              </form>
            </div>
          </div>
        </div>

        <FaqSection heading="Questions people actually ask." faqs={FIND_FAQS} />
      </main>

      <SiteFooter />
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">
        {label}
        {hint && <span className="field__hint"> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}

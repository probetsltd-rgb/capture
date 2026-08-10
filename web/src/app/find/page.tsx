"use client";

import { useActionState } from "react";
import Link from "next/link";
import { submitIntake, type IntakeState } from "./actions";
import {
  INDUSTRIES,
  REVENUE_BUCKETS,
  CONVERSATION_VOLUME_BUCKETS,
} from "./constants";

const initialState: IntakeState = { status: "idle", message: null };

export default function FindPage() {
  const [state, formAction, pending] = useActionState(submitIntake, initialState);

  if (state.status === "success") {
    return (
      <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "sans-serif" }}>
        <h1>You&apos;re in.</h1>
        <p>{state.message}</p>
        {state.uploadUrl && (
          <p>
            <Link
              href={state.uploadUrl}
              style={{
                display: "inline-block",
                padding: "0.6rem 1.2rem",
                background: "#111",
                color: "#fff",
                textDecoration: "none",
                borderRadius: "4px",
              }}
            >
              Upload my conversations now
            </Link>
          </p>
        )}
        <p>
          <Link href="/">Back to home</Link>
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "3rem auto", fontFamily: "sans-serif" }}>
      <h1>Find My Revenue Leaks</h1>
      <p>
        Free. Takes about a minute. We&apos;ll follow up to collect a sample of your WhatsApp
        conversations and show you where enquiries are going unanswered or cold.
      </p>

      <form action={formAction}>
        {/* Honeypot — hidden from real users via CSS, not `type="hidden"`
            (some bots skip those), never sent a value by a human. */}
        <div style={{ position: "absolute", left: "-9999px" }} aria-hidden="true">
          <label htmlFor="website_url">Leave this field blank</label>
          <input type="text" id="website_url" name="website_url" tabIndex={-1} autoComplete="off" />
        </div>

        <Field label="Business name">
          <input type="text" name="business_name" required maxLength={200} style={inputStyle} />
        </Field>

        <Field label="Industry">
          <select name="industry" required defaultValue="" style={inputStyle}>
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

        <Field label="Website or Instagram (optional)">
          <input type="text" name="website_or_instagram" style={inputStyle} />
        </Field>

        <Field label="Approximate annual revenue">
          <select name="revenue_bucket" required defaultValue="" style={inputStyle}>
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
          <select name="volume_bucket" required defaultValue="" style={inputStyle}>
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
          <input type="email" name="contact_email" required style={inputStyle} />
        </Field>

        <Field label="WhatsApp number (optional)">
          <input type="tel" name="contact_phone" style={inputStyle} />
        </Field>

        <label style={{ display: "flex", gap: "0.5rem", margin: "1rem 0", fontSize: "0.9rem" }}>
          <input type="checkbox" name="consent" required />
          <span>
            I agree to Capture&apos;s{" "}
            <Link href="/privacy">Privacy &amp; Data Handling</Link> terms, including analysis of
            the WhatsApp conversations I&apos;ll provide for this audit.
          </span>
        </label>

        {state.status === "error" && (
          <p style={{ color: "crimson" }}>{state.message}</p>
        )}

        <button type="submit" disabled={pending} style={{ padding: "0.6rem 1.2rem" }}>
          {pending ? "Submitting…" : "Get my Revenue Leak Report"}
        </button>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem",
  marginTop: "0.25rem",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: "1rem" }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

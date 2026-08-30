import "server-only";
import dns from "node:dns/promises";

// Founder request 2026-08-30: a business's own website is often cleaner
// source material than DM replies — curated, not typed in a rush — and
// unlike the 30-day conversation seed, it doesn't need any history to
// exist at all. This module only fetches a URL and reduces it to plain
// text; category/fact extraction reuses extractKnowledgeItems's existing
// "document" prompt unchanged (brochure-extract.ts) — a webpage's visible
// text isn't meaningfully different in kind from an uploaded PDF's once
// extracted.
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // generous headroom for a marketing site's HTML
const FETCH_TIMEOUT_MS = 8000;

// Classic SSRF guard for a user-supplied-URL fetch: resolve DNS ourselves
// and refuse anything pointing at a private/internal/link-local address
// (169.254.169.254 — cloud metadata endpoints — included) before ever
// making the request. IPv6 is rejected outright rather than also
// enumerating its private ranges: real small-business marketing sites are
// effectively always reachable over IPv4, so this trades a negligible
// amount of reach for a much simpler, harder-to-get-wrong check.
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true; // malformed — refuse to be safe
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

export type FetchWebsiteResult = { ok: true; text: string } | { ok: false; message: string };

export async function fetchWebsiteText(rawUrl: string): Promise<FetchWebsiteResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, message: "That doesn't look like a valid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "Only http/https links are supported." };
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(url.hostname, { all: true });
  } catch {
    return { ok: false, message: "Could not resolve that address." };
  }
  if (addresses.length === 0 || addresses.some((a) => a.family !== 4 || isPrivateIPv4(a.address))) {
    return { ok: false, message: "That address isn't reachable." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      signal: controller.signal,
      // Manual, not "follow": a redirect target's hostname would bypass
      // the DNS check above entirely. Simpler and safer to ask the human
      // for the direct URL than to re-validate every hop.
      redirect: "manual",
      headers: { "User-Agent": "CaptureBot/1.0 (+https://capture.com.ng)" },
    });
  } catch {
    return { ok: false, message: "Could not reach that website — check the URL and try again." };
  } finally {
    clearTimeout(timeout);
  }

  if (response.status >= 300 && response.status < 400) {
    return { ok: false, message: "That link redirects — please paste the exact final URL instead." };
  }
  if (!response.ok) {
    return { ok: false, message: `That website returned an error (${response.status}).` };
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    return { ok: false, message: "That URL doesn't look like a webpage." };
  }

  const reader = response.body?.getReader();
  if (!reader) return { ok: false, message: "Could not read that website's response." };
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const html = Buffer.concat(chunks).toString("utf-8");
  const text = htmlToText(html);
  if (text.length < 20) {
    return { ok: false, message: "Could not find any readable text on that page." };
  }
  return { ok: true, text };
}

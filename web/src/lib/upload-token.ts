import "server-only";
import { randomBytes } from "node:crypto";

// The token is the *only* thing gating /upload/[token] and /report/[token],
// and since Phase 4 it is also half of the /onboarding?claim= credential
// (the other half being a match against the business's contact_email) —
// so it has to be unguessable, and every path that creates a business has
// to produce one. Shared rather than inlined at each call site because the
// self-serve signup path originally forgot it entirely, leaving those
// businesses with /upload/null and /report/null links.
//
// 32 bytes / 256 bits of CSPRNG entropy, hex-encoded. See OUTSTANDINGS.md
// for the known gap that these tokens still never expire.
export function generateUploadToken(): string {
  return randomBytes(32).toString("hex");
}

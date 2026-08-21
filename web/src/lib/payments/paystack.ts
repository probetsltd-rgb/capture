import "server-only";
import crypto from "node:crypto";

// Founder request 2026-08-21: real Engage billing via Paystack (chosen
// provider, founder holds the real API keys). Plain REST via fetch, not a
// third-party SDK — Paystack's API is a small, stable, well-documented
// REST surface, and a direct call is easier to verify against the real
// docs than trusting an unmaintained wrapper package. Every endpoint/field
// used here was confirmed against Paystack's current documentation before
// writing this (transaction/initialize, transaction/verify, and the
// x-paystack-signature webhook scheme) rather than relied on from memory.

const PAYSTACK_BASE_URL = "https://api.paystack.co";

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return key;
}

export type InitializeTransactionParams = {
  email: string;
  amountKobo: number;
  planCode?: string;
  callbackUrl?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
};

export type InitializeTransactionResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

// Providing planCode invalidates amountKobo on Paystack's side (their own
// documented behavior) — still passed through here so a plan-less
// one-off charge remains possible if ever needed, but every real call
// site in this codebase always passes a planCode (see actions.ts).
export async function initializeTransaction(
  params: InitializeTransactionParams,
): Promise<InitializeTransactionResult> {
  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountKobo,
      plan: params.planCode,
      callback_url: params.callbackUrl,
      reference: params.reference,
      metadata: params.metadata,
    }),
  });

  const body = await response.json();
  if (!response.ok || !body.status) {
    throw new Error(`Paystack initialize-transaction failed: ${body.message ?? response.statusText}`);
  }

  return {
    authorizationUrl: body.data.authorization_url,
    accessCode: body.data.access_code,
    reference: body.data.reference,
  };
}

export type VerifyTransactionResult = {
  status: string; // "success" | "failed" | "abandoned" | ...
  reference: string;
  amountKobo: number;
  planCode: string | null;
  customerCode: string | null;
  authorizationCode: string | null;
};

export async function verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });

  const body = await response.json();
  if (!response.ok || !body.status) {
    throw new Error(`Paystack verify-transaction failed: ${body.message ?? response.statusText}`);
  }

  const data = body.data;
  return {
    status: data.status,
    reference: data.reference,
    amountKobo: data.amount,
    planCode: data.plan ?? data.plan_object?.plan_code ?? null,
    customerCode: data.customer?.customer_code ?? null,
    authorizationCode: data.authorization?.authorization_code ?? null,
  };
}

// Founder question 2026-08-21: the /admin/plans comparison table's price
// is display data from our own `plans` table — it is NOT what Paystack
// actually charges. Checkout is driven by `paystack_plan_code`, and
// providing a `plan` code to /transaction/initialize overrides whatever
// amount we'd otherwise send (Paystack's own documented behavior). Without
// this function, editing a price in /admin/plans would silently diverge
// from what customers are actually charged. Confirmed against Paystack's
// current docs: `PUT /plan/:id_or_code`, body `{ amount,
// update_existing_subscriptions }`. update_existing_subscriptions
// deliberately defaults to false here (Paystack's own API default is
// true) — a price change should apply to new subscribers going forward,
// not silently reprice someone already paying the old rate.
export async function updatePaystackPlanAmount(
  planCode: string,
  amountKobo: number,
  updateExistingSubscriptions = false,
): Promise<void> {
  const response = await fetch(`${PAYSTACK_BASE_URL}/plan/${encodeURIComponent(planCode)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: amountKobo, update_existing_subscriptions: updateExistingSubscriptions }),
  });

  const body = await response.json();
  if (!response.ok || !body.status) {
    throw new Error(`Paystack update-plan failed: ${body.message ?? response.statusText}`);
  }
}

// x-paystack-signature is an HMAC-SHA512 hex digest of the raw request
// body, keyed with the secret key — confirmed against Paystack's current
// webhook documentation. Constant-time comparison, same pattern as the
// Instagram webhook's x-hub-signature-256 check
// (api/channels/instagram/webhook/route.ts).
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;

  const expected = crypto.createHmac("sha512", secretKey()).update(rawBody).digest("hex");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

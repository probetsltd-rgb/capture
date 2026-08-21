import { NextRequest, NextResponse } from "next/server";
import { verifyTransaction } from "@/lib/payments/paystack";

// Paystack redirects here after checkout. This is UX feedback only — it
// never itself grants access. Real activation happens exclusively via
// api/webhooks/paystack/route.ts, which is the only party that has
// actually confirmed payment with Paystack server-to-server rather than
// trusting a query param a browser could tamper with or replay.
export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference") ?? request.nextUrl.searchParams.get("trxref");
  const dashboardUrl = new URL("/dashboard", request.url);

  if (!reference) {
    dashboardUrl.searchParams.set("billing", "unknown");
    return NextResponse.redirect(dashboardUrl);
  }

  try {
    const result = await verifyTransaction(reference);
    dashboardUrl.searchParams.set("billing", result.status === "success" ? "success" : "pending");
  } catch (error) {
    console.error("Paystack callback: verify-transaction failed", error);
    dashboardUrl.searchParams.set("billing", "pending");
  }

  return NextResponse.redirect(dashboardUrl);
}

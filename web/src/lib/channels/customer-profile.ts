import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type CustomerProfile = { name: string | null; handle: string | null };

// Real-time Instagram/Messenger webhooks give only an opaque sender id, so a
// live-created customer has no name until we ask the platform. This runs
// on the way to the first reply, so it must never make that reply slower or
// fail: hard timeout, every error swallowed (logged), and a no-op if the
// customer already has any name/handle. On failure the greeting simply falls
// back to the generic one — same behaviour as before this existed.
const LOOKUP_TIMEOUT_MS = 2500;

export async function enrichCustomerProfile(
  customerId: string,
  lookup: (signal: AbortSignal) => Promise<CustomerProfile | null>,
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { data: customer } = await supabase
      .from("customers")
      .select("name, handle")
      .eq("id", customerId)
      .maybeSingle();
    if (!customer || customer.name || customer.handle) return;

    const signal = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);
    const profile = await lookup(signal);
    if (!profile || (!profile.name && !profile.handle)) return;

    await supabase
      .from("customers")
      .update({ name: profile.name, handle: profile.handle })
      .eq("id", customerId)
      .is("name", null)
      .is("handle", null);
  } catch (error) {
    console.error("enrichCustomerProfile: lookup failed, falling back to generic greeting", error);
  }
}

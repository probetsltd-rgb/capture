"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type InterestState = {
  status: "idle" | "error" | "success";
  message: string | null;
};

export async function captureInterest(
  token: string,
  _prevState: InterestState,
  formData: FormData,
): Promise<InterestState> {
  const wantsRecover = formData.get("recover") === "on";
  const wantsPrevent = formData.get("prevent") === "on";

  if (!wantsRecover && !wantsPrevent) {
    return { status: "error", message: "Select at least one option." };
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      interested_in_recover: wantsRecover,
      interested_in_prevent: wantsPrevent,
      interest_captured_at: new Date().toISOString(),
    })
    .eq("upload_token", token);

  if (error) {
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  return { status: "success", message: "Thanks — we'll be in touch." };
}

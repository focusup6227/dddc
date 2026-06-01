"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function str(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export async function saveProfile(formData: FormData) {
  const { userId, profile } = await requireCustomer();

  const smsOptIn = formData.get("sms_opt_in") != null;

  const payload: Record<string, unknown> = {
    full_name: str(formData.get("full_name")) ?? "",
    phone: str(formData.get("phone")),
    address: str(formData.get("address")),
    emergency_contact_name: str(formData.get("emergency_contact_name")),
    emergency_contact_phone: str(formData.get("emergency_contact_phone")),
    sms_opt_in: smsOptIn,
    notify_prefs: {
      confirmations: formData.get("notify_confirmations") != null,
      reminders: formData.get("notify_reminders") != null,
      report_cards: formData.get("notify_report_cards") != null,
    },
  };

  // Stamp the consent time only when opting in fresh — keep the original date
  // as proof of consent, and don't churn it on every save. Clearing the box
  // wipes the timestamp so a later re-opt-in records a new one.
  if (smsOptIn && !profile.sms_opt_in) {
    payload.sms_opt_in_at = new Date().toISOString();
  } else if (!smsOptIn) {
    payload.sms_opt_in_at = null;
  }

  if (!payload.full_name) {
    redirect("/account?error=" + encodeURIComponent("Name is required."));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", userId);

  if (error) {
    redirect("/account?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/account");
  redirect("/account?saved=1");
}

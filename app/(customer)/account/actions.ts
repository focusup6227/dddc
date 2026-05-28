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
  const { userId } = await requireCustomer();

  const payload = {
    full_name: str(formData.get("full_name")) ?? "",
    phone: str(formData.get("phone")),
    address: str(formData.get("address")),
    emergency_contact_name: str(formData.get("emergency_contact_name")),
    emergency_contact_phone: str(formData.get("emergency_contact_phone")),
  };

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

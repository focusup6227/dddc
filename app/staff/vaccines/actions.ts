"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function str(v: FormDataEntryValue | null): string {
  return v == null ? "" : String(v).trim();
}

export async function verifyVaccine(formData: FormData): Promise<void> {
  const { userId } = await requireStaff();
  const id = str(formData.get("id"));
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("dog_vaccinations")
    .update({
      status: "verified",
      verified_at: new Date().toISOString(),
      verified_by: userId,
      rejection_reason: null,
    })
    .eq("id", id);

  revalidatePath("/staff/vaccines");
  revalidatePath("/staff");
}

export async function rejectVaccine(formData: FormData): Promise<void> {
  const { userId } = await requireStaff();
  const id = str(formData.get("id"));
  const reason = str(formData.get("reason"));
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("dog_vaccinations")
    .update({
      status: "rejected",
      verified_at: new Date().toISOString(),
      verified_by: userId,
      rejection_reason: reason || "Document unreadable or invalid.",
    })
    .eq("id", id);

  revalidatePath("/staff/vaccines");
  revalidatePath("/staff");
}

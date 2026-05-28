"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function savePackage(formData: FormData) {
  await requireStaff();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const days_included = Number(formData.get("days_included") ?? 0);
  const price_cents = Number(formData.get("price_cents") ?? 0);

  if (!name || days_included < 1 || price_cents < 0) return;

  const supabase = await createClient();
  await supabase.from("packages").insert({
    name,
    description,
    days_included,
    price_cents,
    active: true,
    sort_order: 99,
  });
  revalidatePath("/staff/packages");
}

export async function togglePackage(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("packages").update({ active }).eq("id", id);
  revalidatePath("/staff/packages");
}

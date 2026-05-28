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

function num(v: FormDataEntryValue | null): number | null {
  const s = str(v);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function saveDog(formData: FormData) {
  const { userId } = await requireCustomer();
  const id = str(formData.get("id"));

  const payload = {
    owner_id: userId,
    name: str(formData.get("name")) ?? "",
    breed: str(formData.get("breed")),
    sex: str(formData.get("sex")) as "male" | "female" | null,
    spayed_neutered: formData.get("spayed_neutered") === "yes",
    date_of_birth: str(formData.get("date_of_birth")),
    weight_lbs: num(formData.get("weight_lbs")),
    color: str(formData.get("color")),
    photo_path: str(formData.get("photo_path")),
    vet_name: str(formData.get("vet_name")),
    vet_phone: str(formData.get("vet_phone")),
    vaccinations_current: formData.get("vaccinations_current") === "yes",
    vaccination_notes: str(formData.get("vaccination_notes")),
    allergies: str(formData.get("allergies")),
    medications: str(formData.get("medications")),
    feeding_notes: str(formData.get("feeding_notes")),
    behavior_notes: str(formData.get("behavior_notes")),
  };

  if (!payload.name) {
    redirect("/dogs?error=Name+is+required");
  }

  const supabase = await createClient();
  if (id) {
    await supabase.from("dogs").update(payload).eq("id", id).eq("owner_id", userId);
  } else {
    await supabase.from("dogs").insert(payload);
  }

  revalidatePath("/dogs");
  redirect("/dogs");
}

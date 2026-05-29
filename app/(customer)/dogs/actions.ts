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
    microchipped: formData.get("microchipped") === "yes",
    microchip_number: str(formData.get("microchip_number")),
    allergies: str(formData.get("allergies")),
    medications: str(formData.get("medications")),
    health_issues: str(formData.get("health_issues")),
    gets_along_with: formData
      .getAll("gets_along_with")
      .map((v) => String(v))
      .filter(Boolean),
    additional_notes: str(formData.get("additional_notes")),
    feeding_notes: str(formData.get("feeding_notes")),
    behavior_notes: str(formData.get("behavior_notes")),
  };

  if (!payload.name) {
    redirect("/dogs?error=Name+is+required");
  }

  const supabase = await createClient();
  let nextDogId = id;
  if (id) {
    await supabase.from("dogs").update(payload).eq("id", id).eq("owner_id", userId);
  } else {
    const { data: inserted } = await supabase
      .from("dogs")
      .insert(payload)
      .select("id")
      .single<{ id: string }>();
    nextDogId = inserted?.id ?? null;
  }

  revalidatePath("/dogs");
  // For brand-new dogs, land on the detail page so the customer can
  // immediately upload vaccine records.
  if (!id && nextDogId) redirect(`/dogs/${nextDogId}?new=1`);
  redirect("/dogs");
}

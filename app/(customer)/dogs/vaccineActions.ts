"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { REQUIRED_VACCINES, VACCINE_BUCKET } from "@/lib/vaccines";
import type { VaccineType } from "@/lib/supabase/types";

const VACCINE_KEYS = new Set<VaccineType>(REQUIRED_VACCINES.map((v) => v.key));
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(v: FormDataEntryValue | null): string {
  return v == null ? "" : String(v).trim();
}

export async function saveVaccineRecord(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { userId } = await requireCustomer();
  const dog_id = str(formData.get("dog_id"));
  const vaccine_type = str(formData.get("vaccine_type")) as VaccineType;
  const document_path = str(formData.get("document_path"));
  const expires_on = str(formData.get("expires_on"));

  if (!dog_id) return { ok: false, error: "Missing dog." };
  if (!VACCINE_KEYS.has(vaccine_type))
    return { ok: false, error: "Unknown vaccine." };
  if (!document_path) return { ok: false, error: "Please attach a document." };
  if (!ISO_RE.test(expires_on))
    return { ok: false, error: "Pick an expiration date." };
  // Storage path must be scoped to this user's folder to satisfy bucket RLS.
  if (!document_path.startsWith(`${userId}/${dog_id}/`)) {
    return { ok: false, error: "Invalid upload path." };
  }

  const supabase = await createClient();
  // Ownership check; the RLS policy enforces this too but a clear error
  // beats a generic permission failure.
  const { data: dog } = await supabase
    .from("dogs")
    .select("id")
    .eq("id", dog_id)
    .eq("owner_id", userId)
    .maybeSingle<{ id: string }>();
  if (!dog) return { ok: false, error: "Dog not found." };

  const { error } = await supabase.from("dog_vaccinations").insert({
    dog_id,
    vaccine_type,
    document_path,
    expires_on,
    uploaded_by: userId,
    status: "pending",
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dogs/${dog_id}`);
  return { ok: true };
}

export async function deleteVaccineRecord(formData: FormData): Promise<void> {
  const { userId } = await requireCustomer();
  const id = str(formData.get("id"));
  const dog_id = str(formData.get("dog_id"));
  if (!id || !dog_id) return;

  const supabase = await createClient();
  // RLS limits this to owner's dogs; still load the row so we can clean up
  // the uploaded file from storage.
  const { data: row } = await supabase
    .from("dog_vaccinations")
    .select("document_path")
    .eq("id", id)
    .maybeSingle<{ document_path: string }>();
  if (!row) return;

  await supabase.from("dog_vaccinations").delete().eq("id", id);
  // Only the owner's own folder should ever be deleted; double-check.
  if (row.document_path.startsWith(`${userId}/`)) {
    await supabase.storage.from(VACCINE_BUCKET).remove([row.document_path]);
  }
  revalidatePath(`/dogs/${dog_id}`);
}

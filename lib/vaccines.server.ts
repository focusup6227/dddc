import "server-only";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { DogVaccination, VaccineType } from "@/lib/supabase/types";
import {
  missingForBooking,
  summarizeCoverage,
  VACCINE_BUCKET,
  type VaccineCoverage,
} from "@/lib/vaccines";

export async function loadDogCoverage(dogId: string): Promise<VaccineCoverage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dog_vaccinations")
    .select("*")
    .eq("dog_id", dogId);
  return summarizeCoverage((data ?? []) as DogVaccination[]);
}

export async function getPendingVaccineCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("dog_vaccinations")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

/**
 * Server-side gate used by booking actions. Bypasses RLS via service client
 * so customer requests can't smuggle in someone else's records.
 */
export async function assertDogReadyToBook(
  dogId: string,
  lastServiceDate: string,
): Promise<{ ok: true } | { ok: false; missing: VaccineType[] }> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("dog_vaccinations")
    .select("*")
    .eq("dog_id", dogId);
  const coverage = summarizeCoverage(
    (data ?? []) as DogVaccination[],
    lastServiceDate,
  );
  const missing = missingForBooking(coverage, lastServiceDate);
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

export async function getSignedVaccineUrl(
  documentPath: string,
  expiresInSeconds = 60 * 10,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(VACCINE_BUCKET)
    .createSignedUrl(documentPath, expiresInSeconds);
  return data?.signedUrl ?? null;
}

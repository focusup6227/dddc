import { createClient, createServiceClient } from "@/lib/supabase/server";

export const DEFAULT_MAX_DOGS_PER_DAY = 30;

/**
 * Get a setting by key. Falls back to the provided default.
 */
export async function getSetting(
  key: string,
  fallback: string | null = null,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle<{ value: string }>();
  return data?.value ?? fallback;
}

export async function getMaxDogsPerDay(): Promise<number> {
  const raw = await getSetting("max_dogs_per_day", String(DEFAULT_MAX_DOGS_PER_DAY));
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_DOGS_PER_DAY;
}

/**
 * Counts non-canceled bookings per date for the given dates.
 * Returns a map: date -> count.
 */
export async function getDayCounts(dates: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (dates.length === 0) return result;
  const svc = createServiceClient();
  const { data } = await svc
    .from("bookings")
    .select("service_date")
    .in("service_date", dates)
    .neq("status", "canceled");
  for (const row of data ?? []) {
    result.set(row.service_date, (result.get(row.service_date) ?? 0) + 1);
  }
  return result;
}

/**
 * Returns the set of dates that are at or above capacity.
 */
export async function getFullDates(dates: string[]): Promise<Set<string>> {
  const [counts, max] = await Promise.all([getDayCounts(dates), getMaxDogsPerDay()]);
  const full = new Set<string>();
  for (const [d, n] of counts) {
    if (n >= max) full.add(d);
  }
  return full;
}

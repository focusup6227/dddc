import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { ServiceKind } from "@/lib/supabase/types";

export const DEFAULT_MAX_DOGS_PER_DAY = 30;
export const DEFAULT_MAX_DOGS_PER_NIGHT = 5;
export const DEFAULT_BOARDING_RATE_CENTS = 3000;

// Live-mode Stripe price for boarding (one night, $30). Created via the
// Stripe MCP on 2026-05-28. If the boarding rate in settings is changed
// to something other than this price's unit_amount, boarding checkouts
// fall back to ad-hoc price_data so customers are charged what was quoted.
export const BOARDING_STRIPE_PRICE_ID = "price_1Tbx4YIt0IEhgtKThLzD4M2x";
export const BOARDING_STRIPE_PRICE_AMOUNT_CENTS = 3000;

// Optional dog-wash add-on, a flat one-time charge per booking. Billed via
// ad-hoc Stripe price_data (no pre-made price), so changing it here is enough.
export const DOG_WASH_PRICE_CENTS = 1000;

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

export async function getMaxDogsPerNight(): Promise<number> {
  const raw = await getSetting("max_dogs_per_night", String(DEFAULT_MAX_DOGS_PER_NIGHT));
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_DOGS_PER_NIGHT;
}

export async function getMaxForKind(kind: ServiceKind): Promise<number> {
  return kind === "boarding" ? getMaxDogsPerNight() : getMaxDogsPerDay();
}

export async function getBoardingRateCents(): Promise<number> {
  const raw = await getSetting("boarding_rate_cents", String(DEFAULT_BOARDING_RATE_CENTS));
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BOARDING_RATE_CENTS;
}

/**
 * Counts non-canceled bookings of the given kind that overlap each given
 * date. A booking overlaps date D when service_date <= D < service_end_date.
 * Works uniformly for daycare (1-day spans) and boarding (N-night spans).
 */
export async function getDayCounts(
  dates: string[],
  kind: ServiceKind = "daycare",
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (dates.length === 0) return result;
  for (const d of dates) result.set(d, 0);
  const minDate = dates.reduce((a, b) => (a < b ? a : b));
  const maxDate = dates.reduce((a, b) => (a > b ? a : b));
  const svc = createServiceClient();
  const { data } = await svc
    .from("bookings")
    .select("service_date, service_end_date")
    .eq("service_kind", kind)
    .lte("service_date", maxDate)
    .gt("service_end_date", minDate)
    .neq("status", "canceled");
  for (const row of data ?? []) {
    for (const d of dates) {
      if (row.service_date <= d && d < row.service_end_date) {
        result.set(d, (result.get(d) ?? 0) + 1);
      }
    }
  }
  return result;
}

/**
 * Returns the set of dates that are at or above capacity for the given kind.
 */
export async function getFullDates(
  dates: string[],
  kind: ServiceKind = "daycare",
): Promise<Set<string>> {
  const [counts, max] = await Promise.all([getDayCounts(dates, kind), getMaxForKind(kind)]);
  const full = new Set<string>();
  for (const [d, n] of counts) {
    if (n >= max) full.add(d);
  }
  return full;
}

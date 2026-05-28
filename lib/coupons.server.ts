import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import type { Booking, Coupon } from "@/lib/supabase/types";

/**
 * Look up an active, non-expired coupon by code. Service client so customers
 * can validate codes via server actions without needing read access to the
 * coupons table.
 */
export async function lookupCoupon(rawCode: string): Promise<Coupon | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  const svc = createServiceClient();
  const { data } = await svc
    .from("coupons")
    .select("*")
    .eq("code", code)
    .eq("active", true)
    .maybeSingle<Coupon>();
  if (!data) return null;
  if (data.expires_on && data.expires_on < todayISO()) return null;
  return data;
}

/**
 * How many billable days a booking covers. Daycare = 1, boarding = nights.
 * Matches the math in createBookingCheckoutSession.
 */
export function couponUnitCount(
  booking: Pick<Booking, "service_kind" | "service_date" | "service_end_date">,
): number {
  if (booking.service_kind !== "boarding") return 1;
  const [y1, m1, d1] = booking.service_date.split("-").map(Number);
  const [y2, m2, d2] = booking.service_end_date.split("-").map(Number);
  const nights = Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000,
  );
  return Math.max(1, nights);
}

export function calcCouponDiscount(
  coupon: Pick<Coupon, "discount_per_day_cents">,
  booking: Pick<Booking, "service_kind" | "service_date" | "service_end_date">,
  totalCents: number,
): number {
  const raw = coupon.discount_per_day_cents * couponUnitCount(booking);
  return Math.min(Math.max(0, raw), totalCents);
}

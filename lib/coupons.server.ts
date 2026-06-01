import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import type { Booking, Coupon } from "@/lib/supabase/types";

type Svc = ReturnType<typeof createServiceClient>;

/**
 * Stamp an account-level coupon onto a customer's currently-open bookings —
 * the unpaid, chargeable, not-yet-couponed ones. New bookings get stamped by
 * the apply_account_coupon DB trigger; this back-fills the ones that already
 * exist when staff attach the coupon.
 */
export async function applyAccountCouponToOpenBookings(
  svc: Svc,
  customerId: string,
  coupon: Coupon,
): Promise<void> {
  const { data } = await svc
    .from("bookings")
    .select("id, service_kind, service_date, service_end_date, unit_price_cents")
    .eq("customer_id", customerId)
    .eq("payment_status", "unpaid")
    .eq("status", "reserved")
    .is("coupon_id", null)
    .neq("payment_kind", "package");
  const open = (data ?? []) as Pick<
    Booking,
    "id" | "service_kind" | "service_date" | "service_end_date" | "unit_price_cents"
  >[];
  for (const b of open) {
    const total = (b.unit_price_cents ?? 0) * couponUnitCount(b);
    const discount = calcCouponDiscount(coupon, b, total);
    await svc
      .from("bookings")
      .update({ coupon_id: coupon.id, coupon_discount_cents: discount })
      .eq("id", b.id);
  }
}

/**
 * Reverse the above: clear a specific coupon off a customer's open bookings
 * (used when staff swap or remove the account coupon). Only touches unpaid
 * rows still carrying that coupon, never a paid/charged one.
 */
export async function clearAccountCouponFromOpenBookings(
  svc: Svc,
  customerId: string,
  couponId: string,
): Promise<void> {
  await svc
    .from("bookings")
    .update({ coupon_id: null, coupon_discount_cents: 0 })
    .eq("customer_id", customerId)
    .eq("payment_status", "unpaid")
    .eq("status", "reserved")
    .eq("coupon_id", couponId);
}

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

export type UnpaidSettlement = {
  booking: Booking;
  /** price × units (full, before any discount) */
  total: number;
  /** amount actually taken off — coupon OR credit, never both */
  discount: number;
  /** portion of `discount` that is account credit (the rest is coupon) */
  creditApplied: number;
  useCoupon: boolean;
  /** total − discount, always ≥ 0 — the amount Stripe should charge */
  chargeAfter: number;
};

/**
 * Settle a list of unpaid bookings against a shared account-credit pool. Per
 * booking we apply whichever is larger — its frozen coupon discount or the
 * available account credit — never both, exactly like
 * createBookingCheckoutSession does for a single booking. Credit draws down
 * from the shared pool in array order, so pass bookings in a stable order
 * (e.g. by service_date). Both the displayed balance and the actual charge run
 * through this one function, so they can never disagree.
 */
export function settleUnpaidBookings(
  bookings: Booking[],
  creditPoolCents: number,
): UnpaidSettlement[] {
  let pool = Math.max(0, creditPoolCents);
  return bookings.map((booking) => {
    const total = (booking.unit_price_cents ?? 0) * couponUnitCount(booking);
    const coupon = Math.min(
      Math.max(0, booking.coupon_discount_cents ?? 0),
      total,
    );
    const creditAvail = Math.min(pool, total);
    const useCoupon = coupon > 0 && coupon >= creditAvail;
    const discount = useCoupon ? coupon : creditAvail;
    const creditApplied = useCoupon ? 0 : creditAvail;
    pool -= creditApplied;
    return {
      booking,
      total,
      discount,
      creditApplied,
      useCoupon,
      chargeAfter: total - discount,
    };
  });
}

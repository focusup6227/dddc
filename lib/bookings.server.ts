import "server-only";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { sendBookingCancellation } from "@/lib/email";
import type { Booking, CustomerPackage } from "@/lib/supabase/types";

export type CancelOutcome =
  | { ok: false; reason: string }
  | {
      ok: true;
      refundFraction: 1 | 0.5 | 0;
      refundAmountCents: number;
      stripeRefundId: string | null;
      packageDayRestored: boolean;
    };

export type CancelActor = "customer" | "staff";

/**
 * Refund fraction.
 *   - Staff cancels: always 100% (we don't penalize the customer when we cancel).
 *   - Customer cancels > 24h before service: 100%.
 *   - Customer cancels within 24h (or after start): 50%.
 */
export function refundFractionForBooking(
  serviceDate: string,
  actorRole: CancelActor,
  now: Date = new Date(),
): 1 | 0.5 {
  if (actorRole === "staff") return 1;
  const [y, m, d] = serviceDate.split("-").map(Number);
  const startLocal = new Date(y, m - 1, d, 0, 0, 0).getTime();
  const hoursAway = (startLocal - now.getTime()) / 3_600_000;
  return hoursAway > 24 ? 1 : 0.5;
}

/**
 * Cancel a booking and issue an automatic refund.
 *
 * Drop-in/boarding paid bookings → Stripe refund of {full|half} the charge.
 * Package-funded bookings → restore one day to the package iff outside 24h;
 *   forfeited within 24h (matches the spirit of the 50% rule for cash bookings).
 * Unpaid bookings → just mark canceled.
 *
 * Callers must enforce who can cancel (customer-self vs staff) before calling.
 */
export async function cancelBookingWithRefund(args: {
  booking: Booking;
  actorId: string;
  actorRole: CancelActor;
  reason?: string | null;
}): Promise<CancelOutcome> {
  const { booking, actorId, actorRole, reason } = args;
  if (booking.status === "canceled") {
    return { ok: false, reason: "Already canceled" };
  }
  if (booking.status !== "reserved") {
    return { ok: false, reason: `Cannot cancel a ${booking.status} booking` };
  }

  const svc = createServiceClient();
  const fraction = refundFractionForBooking(booking.service_date, actorRole);

  let refundAmountCents = 0;
  let stripeRefundId: string | null = null;
  let packageDayRestored = false;

  if (booking.payment_kind === "package" && booking.customer_package_id) {
    if (fraction === 1) {
      const { data: pkg } = await svc
        .from("customer_packages")
        .select("*")
        .eq("id", booking.customer_package_id)
        .maybeSingle<CustomerPackage>();
      if (pkg && pkg.days_remaining < pkg.days_total) {
        await svc
          .from("customer_packages")
          .update({ days_remaining: pkg.days_remaining + 1 })
          .eq("id", pkg.id);
        packageDayRestored = true;
      }
    }
  } else if (
    booking.payment_kind === "drop_in" &&
    booking.payment_status === "paid" &&
    booking.stripe_payment_intent_id &&
    booking.unit_price_cents
  ) {
    // Compute the charge for THIS booking row. Boarding rows store one row
    // covering N nights; daycare drop-ins store one row per day.
    const nights = countNights(booking.service_date, booking.service_end_date);
    const totalCents = booking.unit_price_cents * Math.max(1, nights);
    refundAmountCents = Math.round(totalCents * fraction);
    if (refundAmountCents > 0) {
      const stripe = getStripe();
      const refund = await stripe.refunds.create({
        payment_intent: booking.stripe_payment_intent_id,
        amount: refundAmountCents,
        reason: "requested_by_customer",
        metadata: {
          booking_id: booking.id,
          canceled_by: actorId,
        },
      });
      stripeRefundId = refund.id;
    }
  }

  const newPaymentStatus =
    booking.payment_status === "paid" && refundAmountCents > 0
      ? "refunded"
      : booking.payment_status;

  await svc
    .from("bookings")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      canceled_by: actorId,
      cancellation_reason: reason ?? null,
      refund_amount_cents: refundAmountCents,
      stripe_refund_id: stripeRefundId,
      payment_status: newPaymentStatus,
    })
    .eq("id", booking.id);

  // Fire the cancellation email (best-effort).
  const [{ data: profile }, { data: dog }] = await Promise.all([
    svc
      .from("profiles")
      .select("email, full_name")
      .eq("id", booking.customer_id)
      .maybeSingle<{ email: string; full_name: string | null }>(),
    svc
      .from("dogs")
      .select("name")
      .eq("id", booking.dog_id)
      .maybeSingle<{ name: string }>(),
  ]);
  if (profile?.email) {
    await sendBookingCancellation({
      to: profile.email,
      customerName: profile.full_name ?? profile.email,
      dogName: dog?.name ?? "your dog",
      serviceDate: booking.service_date,
      serviceEndDate: booking.service_end_date,
      serviceKind: booking.service_kind,
      paymentKind: booking.payment_kind,
      refundAmountCents,
      packageDayRestored,
      refundFraction: fraction,
      actorRole,
    });
  }

  return {
    ok: true,
    refundFraction: refundAmountCents === 0 && !packageDayRestored ? 0 : fraction,
    refundAmountCents,
    stripeRefundId,
    packageDayRestored,
  };
}

function countNights(start: string, end: string): number {
  const [y1, m1, d1] = start.split("-").map(Number);
  const [y2, m2, d2] = end.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.max(0, Math.round((b - a) / 86400000));
}

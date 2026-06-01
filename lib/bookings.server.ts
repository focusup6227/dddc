import "server-only";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import {
  sendBookingCancellation,
  sendBookingConfirmation,
  sendPaymentReceipt,
} from "@/lib/email";
import { addDays } from "@/lib/format";
import {
  dogWashLineItem,
  getUnpaidAddonsForBookings,
  stampAddonSession,
} from "@/lib/addons.server";
import {
  BOARDING_STRIPE_PRICE_AMOUNT_CENTS,
  BOARDING_STRIPE_PRICE_ID,
} from "@/lib/settings";
import { todayISO } from "@/lib/format";
import type {
  Booking,
  BookingAddon,
  CustomerPackage,
  Dog,
  Package,
  Profile,
} from "@/lib/supabase/types";

export type PastDueBooking = Pick<
  Booking,
  "id" | "service_date" | "service_end_date" | "service_kind" | "unit_price_cents"
>;

/**
 * A booking is past-due once the appointment has *completed* and payment
 * still hasn't landed. For daycare the appointment ends on service_date; for
 * boarding it ends on service_end_date (checkout day). We give the customer
 * through end-of-day on that last day before flagging the row past-due.
 */
export function isPastDueUnpaid(
  b: Pick<
    Booking,
    "service_kind" | "service_date" | "service_end_date" | "payment_status" | "status"
  >,
  today: string = todayISO(),
): boolean {
  if (b.payment_status !== "unpaid") return false;
  if (b.status === "canceled") return false;
  const lastDay =
    b.service_kind === "boarding" ? b.service_end_date : b.service_date;
  return lastDay < today;
}

/**
 * Past-due unpaid bookings for a customer.
 */
export async function getPastDueUnpaid(
  customerId: string,
): Promise<PastDueBooking[]> {
  const svc = createServiceClient();
  const today = todayISO();
  // PostgREST can't easily express the kind-aware comparison, so fetch all
  // open unpaid rows (cheap: there are very few per customer) and filter.
  const { data } = await svc
    .from("bookings")
    .select(
      "id, service_date, service_end_date, service_kind, payment_status, status, unit_price_cents",
    )
    .eq("customer_id", customerId)
    .eq("payment_status", "unpaid")
    .neq("status", "canceled")
    .order("service_date");
  return ((data ?? []) as (PastDueBooking &
    Pick<Booking, "payment_status" | "status">)[])
    .filter((b) => isPastDueUnpaid(b, today))
    .map(({ payment_status: _ps, status: _s, ...rest }) => rest);
}

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

  // Restore the package days this booking consumed — whether it was fully
  // package-funded (1.0) or partially (e.g. 0.5, with the rest paid in cash).
  // Only outside 24h; within 24h the package portion is forfeited, matching the
  // 50% cash rule. Capped so a restore can't push a package over its total.
  if (
    booking.customer_package_id &&
    (booking.package_days_used ?? 0) > 0 &&
    fraction === 1
  ) {
    const { data: pkg } = await svc
      .from("customer_packages")
      .select("*")
      .eq("id", booking.customer_package_id)
      .maybeSingle<CustomerPackage>();
    if (pkg) {
      const restore = Math.min(
        booking.package_days_used,
        pkg.days_total - pkg.days_remaining,
      );
      if (restore > 0) {
        await svc
          .from("customer_packages")
          .update({
            days_remaining: Math.round((pkg.days_remaining + restore) * 10) / 10,
          })
          .eq("id", pkg.id);
        packageDayRestored = true;
      }
    }
  }

  // Refund the cash portion of any paid drop-in (a full day, or the cash half
  // of a partially package-funded day). Runs alongside the package restore
  // above — a partial day gets both.
  if (
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

  // Refund any paid dog wash on this booking under the same fraction as the
  // stay. Each wash refunds against its own payment intent (which may be the
  // booking's, for a bundled checkout, or a standalone one for an add-later).
  let washRefundCents = 0;
  const { data: paidWashes } = await svc
    .from("booking_addons")
    .select("*")
    .eq("booking_id", booking.id)
    .eq("kind", "dog_wash")
    .eq("payment_status", "paid");
  for (const wash of (paidWashes ?? []) as BookingAddon[]) {
    const amount = Math.round(wash.amount_cents * fraction);
    if (amount > 0 && wash.stripe_payment_intent_id) {
      const stripe = getStripe();
      await stripe.refunds.create({
        payment_intent: wash.stripe_payment_intent_id,
        amount,
        reason: "requested_by_customer",
        metadata: { booking_id: booking.id, addon_id: wash.id, canceled_by: actorId },
      });
      washRefundCents += amount;
    }
    await svc
      .from("booking_addons")
      .update({ payment_status: "refunded" })
      .eq("id", wash.id);
  }

  // Drop any never-paid wash so it can't linger as a payable orphan on a
  // canceled booking.
  await svc
    .from("booking_addons")
    .delete()
    .eq("booking_id", booking.id)
    .eq("kind", "dog_wash")
    .eq("payment_status", "unpaid");

  const totalRefundCents = refundAmountCents + washRefundCents;

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
      refundAmountCents: totalRefundCents,
      packageDayRestored,
      refundFraction: fraction,
      actorRole,
    });
  }

  return {
    ok: true,
    refundFraction:
      totalRefundCents === 0 && !packageDayRestored ? 0 : fraction,
    refundAmountCents: totalRefundCents,
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

/**
 * Build + open a Stripe Checkout session to collect payment for an unpaid
 * booking. Used by both the kiosk staff action and the customer-portal "Pay
 * now" button — only the success/cancel URLs and the `source` tag differ.
 *
 * Returns the session URL to redirect to, or null when something is missing
 * (caller should redirect to its own error page).
 */
export async function createBookingCheckoutSession(opts: {
  bookingId: string;
  /** When set, the booking must belong to this customer or null is returned. */
  ownerCustomerId?: string;
  successUrl: string;
  cancelUrl: string;
  source: "kiosk" | "customer-portal";
}): Promise<string | null> {
  const svc = createServiceClient();
  const { data: booking } = await svc
    .from("bookings")
    .select("*")
    .eq("id", opts.bookingId)
    .maybeSingle<Booking>();
  if (!booking) return null;
  if (opts.ownerCustomerId && booking.customer_id !== opts.ownerCustomerId) {
    return null;
  }
  // Collect payment for any unpaid booking, whatever stage it's at — a dog can
  // be checked in (or already checked out) and still owe, and payment is due at
  // pickup. Only a canceled or already-paid booking has nothing to charge.
  if (booking.status === "canceled" || booking.payment_status === "paid") {
    return null;
  }

  const [{ data: dog }, { data: cust }, { data: dropInPkg }] = await Promise.all(
    [
      svc.from("dogs").select("*").eq("id", booking.dog_id).maybeSingle<Dog>(),
      svc
        .from("profiles")
        .select("*")
        .eq("id", booking.customer_id)
        .maybeSingle<Profile>(),
      svc
        .from("packages")
        .select("*")
        .eq("active", true)
        .eq("days_included", 1)
        .order("price_cents")
        .limit(1)
        .maybeSingle<Package>(),
    ],
  );
  if (!dog || !cust || !dropInPkg) return null;

  const isBoarding = booking.service_kind === "boarding";
  const nightsCovered = isBoarding
    ? Math.max(1, countNights(booking.service_date, booking.service_end_date))
    : 1;
  const priceCents =
    booking.unit_price_cents ??
    (isBoarding ? BOARDING_STRIPE_PRICE_AMOUNT_CENTS : dropInPkg.price_cents);
  const totalCents = priceCents * nightsCovered;

  // Customer can have BOTH a coupon stamped on the booking AND account
  // credit available — we apply whichever gives the bigger discount (never
  // both). Coupon discount is frozen at apply-time; credit is read live.
  const couponDiscount = Math.min(
    booking.coupon_discount_cents ?? 0,
    totalCents,
  );
  const creditAvailable = Math.min(cust.account_credit_cents ?? 0, totalCents);
  const useCoupon = couponDiscount > 0 && couponDiscount >= creditAvailable;
  const discountCents = useCoupon ? couponDiscount : creditAvailable;
  const creditToApply = useCoupon ? 0 : creditAvailable;
  const chargeAfterCredit = totalCents - discountCents;

  // Any unpaid dog-wash riding on this booking gets re-bundled here so a
  // customer who abandoned the original checkout still pays for it. Discounts
  // (coupon/credit) only ever apply to the stay itself, never the wash.
  const washAddons = await getUnpaidAddonsForBookings(svc, [booking.id]);
  const washTotal = washAddons.reduce((s, a) => s + a.amount_cents, 0);

  // The stay is fully covered by credit/coupon — settle it outside Stripe.
  // (Discounts never touch the wash, so if there's an unpaid wash we still
  // send the customer to a wash-only Checkout afterward.)
  if (chargeAfterCredit === 0 && discountCents > 0) {
    await svc
      .from("bookings")
      .update({
        payment_kind: "drop_in",
        unit_price_cents: priceCents,
        payment_status: "paid",
        credit_applied_cents: creditToApply,
        stripe_checkout_session_id: null,
      })
      .eq("id", booking.id);
    if (creditToApply > 0) {
      await deductAccountCredit(cust.id, creditToApply);
    }

    const dates: string[] = [];
    let cur = booking.service_date;
    while (cur < booking.service_end_date) {
      dates.push(cur);
      cur = addDays(cur, 1);
    }
    const payMethod = useCoupon ? "coupon" : "account credit";
    await sendBookingConfirmation({
      to: cust.email,
      customerName: cust.full_name || cust.email,
      dogName: dog.name,
      dates,
      paidByPackageCount: 0,
      dropInCount: dates.length,
      dropInTotalCents: totalCents,
    });
    await sendPaymentReceipt({
      to: cust.email,
      customerName: cust.full_name || cust.email,
      description: `${isBoarding ? "Boarding" : "Drop-in"} for ${dog.name} × ${dates.length} ${isBoarding ? "night" : "day"}${dates.length === 1 ? "" : "s"} (${payMethod})`,
      amountCents: totalCents,
      paidAt: new Date(),
    });

    if (washTotal === 0) return opts.successUrl;

    // Base settled by credit; collect the wash on its own Checkout.
    const washStripe = getStripe();
    const washSession = await washStripe.checkout.sessions.create({
      mode: "payment",
      customer_email: cust.email,
      line_items: [dogWashLineItem(dog.name)],
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      metadata: { kind: "addon", customer_id: cust.id, dog_id: dog.id, source: opts.source },
    });
    await stampAddonSession(
      svc,
      washAddons.map((a) => a.id),
      washSession.id,
    );
    return washSession.url ?? null;
  }

  // Stripe rejects unit_amount < 50¢ on most accounts. If a partial discount
  // would push us under that, round up so we still collect a token charge.
  const adjustedUnitAmount = Math.max(
    50,
    Math.ceil(chargeAfterCredit / nightsCovered),
  );
  const effectiveDiscountApplied =
    discountCents > 0
      ? Math.max(0, totalCents - adjustedUnitAmount * nightsCovered)
      : 0;
  const effectiveCreditApplied = useCoupon ? 0 : effectiveDiscountApplied;

  // Reuse the matching pre-made Stripe price when the saved booking rate
  // still matches AND no discount is being applied — otherwise fall back to
  // ad-hoc price_data so we can encode the discounted amount.
  let lineItem: Stripe.Checkout.SessionCreateParams.LineItem;
  if (
    effectiveDiscountApplied === 0 &&
    isBoarding &&
    priceCents === BOARDING_STRIPE_PRICE_AMOUNT_CENTS
  ) {
    lineItem = { price: BOARDING_STRIPE_PRICE_ID, quantity: nightsCovered };
  } else if (
    effectiveDiscountApplied === 0 &&
    !isBoarding &&
    dropInPkg.stripe_price_id &&
    priceCents === dropInPkg.price_cents
  ) {
    lineItem = { price: dropInPkg.stripe_price_id, quantity: 1 };
  } else {
    const baseName = isBoarding
      ? `Boarding (${dog.name})`
      : `Day care drop-in (${dog.name})`;
    const baseDesc = isBoarding
      ? `${nightsCovered} night${nightsCovered === 1 ? "" : "s"}: ${booking.service_date} → ${booking.service_end_date}`
      : `Service date: ${booking.service_date}`;
    let description = baseDesc;
    if (effectiveDiscountApplied > 0) {
      const label = useCoupon ? "coupon" : "account credit";
      description = `${baseDesc} · $${(effectiveDiscountApplied / 100).toFixed(2)} ${label} applied`;
    }
    lineItem = {
      price_data: {
        currency: "usd" as const,
        product_data: { name: baseName, description },
        unit_amount: adjustedUnitAmount,
      },
      quantity: nightsCovered,
    };
  }

  const lineItems = [lineItem];
  if (washTotal > 0) lineItems.push(dogWashLineItem(dog.name));

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: cust.email,
    line_items: lineItems,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: {
      kind: isBoarding ? "boarding" : "drop_in",
      customer_id: cust.id,
      dog_id: dog.id,
      service_dates: booking.service_date,
      source: opts.source,
    },
  });

  await svc
    .from("bookings")
    .update({
      payment_kind: "drop_in",
      unit_price_cents: priceCents,
      stripe_checkout_session_id: session.id,
      payment_status: "unpaid",
      credit_applied_cents: effectiveCreditApplied,
    })
    .eq("id", booking.id);

  // Re-point the unpaid wash(es) at this fresh session so the webhook pays them.
  await stampAddonSession(
    svc,
    washAddons.map((a) => a.id),
    session.id,
  );

  return session.url ?? null;
}

async function deductAccountCredit(customerId: string, cents: number) {
  if (cents <= 0) return;
  const svc = createServiceClient();
  const { data } = await svc
    .from("profiles")
    .select("account_credit_cents")
    .eq("id", customerId)
    .maybeSingle<{ account_credit_cents: number }>();
  const current = data?.account_credit_cents ?? 0;
  const next = Math.max(0, current - cents);
  if (next !== current) {
    await svc
      .from("profiles")
      .update({ account_credit_cents: next })
      .eq("id", customerId);
  }
}

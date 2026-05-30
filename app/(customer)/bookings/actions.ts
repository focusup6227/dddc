"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { requireCustomer } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  cancelBookingWithRefund,
  createBookingCheckoutSession,
  isPastDueUnpaid,
} from "@/lib/bookings.server";
import {
  calcCouponDiscount,
  lookupCoupon,
  settleUnpaidBookings,
} from "@/lib/coupons.server";
import { sendBookingConfirmation, sendPaymentReceipt } from "@/lib/email";
import { addDays } from "@/lib/format";
import { appUrl, getStripe } from "@/lib/stripe";
import type { Booking, Dog } from "@/lib/supabase/types";

export async function applyCouponToBooking(formData: FormData) {
  const { userId } = await requireCustomer();
  const id = String(formData.get("id") ?? "");
  const codeRaw = String(formData.get("code") ?? "").trim();
  if (!id) redirect("/bookings");
  if (!codeRaw) {
    redirect("/bookings?error=" + encodeURIComponent("Enter a code."));
  }

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .eq("customer_id", userId)
    .maybeSingle<Booking>();
  if (!booking) redirect("/bookings");
  if (booking.payment_status !== "unpaid") {
    redirect(
      "/bookings?error=" +
        encodeURIComponent("That booking is already paid."),
    );
  }

  const coupon = await lookupCoupon(codeRaw);
  if (!coupon) {
    redirect("/bookings?error=" + encodeURIComponent("That code isn't valid."));
  }

  const nights = Math.max(
    1,
    booking.service_kind === "boarding"
      ? Math.round(
          (new Date(booking.service_end_date).getTime() -
            new Date(booking.service_date).getTime()) /
            86400000,
        )
      : 1,
  );
  const totalCents = (booking.unit_price_cents ?? 0) * nights;
  const discount = calcCouponDiscount(coupon, booking, totalCents);

  await supabase
    .from("bookings")
    .update({
      coupon_id: coupon.id,
      coupon_discount_cents: discount,
    })
    .eq("id", id)
    .eq("customer_id", userId);

  revalidatePath("/bookings");
  redirect("/bookings?coupon=1");
}

export async function removeCouponFromBooking(formData: FormData) {
  const { userId } = await requireCustomer();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/bookings");

  const supabase = await createClient();
  await supabase
    .from("bookings")
    .update({ coupon_id: null, coupon_discount_cents: 0 })
    .eq("id", id)
    .eq("customer_id", userId);

  revalidatePath("/bookings");
  redirect("/bookings");
}

export async function cancelBooking(formData: FormData) {
  const { userId } = await requireCustomer();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .eq("customer_id", userId)
    .maybeSingle<Booking>();
  if (!booking) return;

  // Past-due unpaid bookings must be paid, not canceled — otherwise the
  // customer would erase the bill for service we already provided.
  if (isPastDueUnpaid(booking)) {
    redirect(
      "/bookings?error=" +
        encodeURIComponent(
          "This booking is past-due and unpaid — please pay it instead of canceling.",
        ),
    );
  }

  await cancelBookingWithRefund({ booking, actorId: userId, actorRole: "customer" });

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
}

export async function payBooking(formData: FormData) {
  const { userId } = await requireCustomer();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/bookings");

  const url = await createBookingCheckoutSession({
    bookingId: id,
    ownerCustomerId: userId,
    successUrl: `${appUrl()}/bookings?paid=1`,
    cancelUrl: `${appUrl()}/bookings?canceled=1`,
    source: "customer-portal",
  });
  if (!url) {
    redirect(
      "/bookings?error=" +
        encodeURIComponent("Couldn't start payment — please contact us."),
    );
  }
  redirect(url);
}

/**
 * Pay every unpaid booking for the customer in a single Stripe Checkout
 * session. The session id is stamped on each row so the existing webhook
 * marks them all paid in one shot.
 */
export async function payAllUnpaid() {
  const { userId, profile } = await requireCustomer();

  const svc = createServiceClient();
  const { data: bookingRows } = await svc
    .from("bookings")
    .select("*")
    .eq("customer_id", userId)
    .eq("payment_status", "unpaid")
    .eq("status", "reserved")
    .order("service_date");
  const unpaid = (bookingRows ?? []) as Booking[];
  if (unpaid.length === 0) {
    redirect("/bookings?error=Nothing+to+pay.");
  }
  if (unpaid.length === 1) {
    // Use the existing single-booking flow so we reuse the pre-made price IDs.
    const url = await createBookingCheckoutSession({
      bookingId: unpaid[0].id,
      ownerCustomerId: userId,
      successUrl: `${appUrl()}/bookings?paid=1`,
      cancelUrl: `${appUrl()}/bookings?canceled=1`,
      source: "customer-portal",
    });
    if (!url) {
      redirect(
        "/bookings?error=" +
          encodeURIComponent("Couldn't start payment — please contact us."),
      );
    }
    redirect(url);
  }

  const dogIds = Array.from(new Set(unpaid.map((b) => b.dog_id)));
  const { data: dogRows } = await svc
    .from("dogs")
    .select("id, name")
    .in("id", dogIds);
  const dogName = new Map(
    ((dogRows ?? []) as Pick<Dog, "id" | "name">[]).map((d) => [d.id, d.name]),
  );

  // Read account credit fresh, then settle each booking against the shared
  // pool — applying its coupon OR credit (never both), exactly like the
  // single-booking checkout. The displayed balance runs the same helper with
  // the same credit pool, so the charge here matches what was shown.
  const { data: prof } = await svc
    .from("profiles")
    .select("account_credit_cents")
    .eq("id", userId)
    .maybeSingle<{ account_credit_cents: number }>();
  const settlements = settleUnpaidBookings(
    unpaid,
    prof?.account_credit_cents ?? 0,
  );

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  const creditByBooking = new Map<string, number>();
  const freeSettlements: typeof settlements = [];

  for (const s of settlements) {
    const b = s.booking;
    const isBoarding = b.service_kind === "boarding";
    const units = isBoarding
      ? Math.max(1, countNights(b.service_date, b.service_end_date))
      : 1;

    // Fully covered by coupon/credit — can't be a $0 Stripe line. Settle now.
    if (s.chargeAfter === 0 && s.discount > 0) {
      freeSettlements.push(s);
      continue;
    }

    // Stripe rejects unit_amount < 50¢; round up so a partial discount still
    // collects a token charge (mirrors createBookingCheckoutSession).
    const adjustedUnit = Math.max(50, Math.ceil(s.chargeAfter / units));
    const effectiveDiscount =
      s.discount > 0 ? Math.max(0, s.total - adjustedUnit * units) : 0;
    const effectiveCredit = s.useCoupon ? 0 : effectiveDiscount;
    creditByBooking.set(b.id, effectiveCredit);

    const name = isBoarding
      ? `Boarding (${dogName.get(b.dog_id) ?? "Dog"})`
      : `Day care (${dogName.get(b.dog_id) ?? "Dog"})`;
    let description = isBoarding
      ? `${units} night${units === 1 ? "" : "s"}: ${b.service_date} → ${b.service_end_date}`
      : `Service date: ${b.service_date}`;
    if (effectiveDiscount > 0) {
      const label = s.useCoupon ? "coupon" : "account credit";
      description += ` · $${(effectiveDiscount / 100).toFixed(2)} ${label} applied`;
    }
    lineItems.push({
      price_data: {
        currency: "usd" as const,
        product_data: { name, description },
        unit_amount: adjustedUnit,
      },
      quantity: units,
    });
  }

  // Mark fully-covered bookings paid outside Stripe and burn their credit now
  // (no webhook fires for these).
  if (freeSettlements.length > 0) {
    await svc
      .from("bookings")
      .update({
        payment_kind: "drop_in",
        payment_status: "paid",
        stripe_checkout_session_id: null,
      })
      .in(
        "id",
        freeSettlements.map((s) => s.booking.id),
      );

    const freeCredit = freeSettlements.reduce(
      (sum, s) => sum + s.creditApplied,
      0,
    );
    if (freeCredit > 0) {
      const current = prof?.account_credit_cents ?? 0;
      await svc
        .from("profiles")
        .update({ account_credit_cents: Math.max(0, current - freeCredit) })
        .eq("id", userId);
    }

    for (const s of freeSettlements) {
      const b = s.booking;
      const dates: string[] = [];
      let cur = b.service_date;
      while (cur < b.service_end_date) {
        dates.push(cur);
        cur = addDays(cur, 1);
      }
      if (dates.length === 0) dates.push(b.service_date);
      const isBoarding = b.service_kind === "boarding";
      const dog = dogName.get(b.dog_id) ?? "Dog";
      await sendBookingConfirmation({
        to: profile.email,
        customerName: profile.full_name || profile.email,
        dogName: dog,
        dates,
        paidByPackageCount: 0,
        dropInCount: dates.length,
        dropInTotalCents: s.total,
      });
      await sendPaymentReceipt({
        to: profile.email,
        customerName: profile.full_name || profile.email,
        description: `${isBoarding ? "Boarding" : "Drop-in"} for ${dog} × ${dates.length} ${isBoarding ? "night" : "day"}${dates.length === 1 ? "" : "s"} (${s.useCoupon ? "coupon" : "account credit"})`,
        amountCents: s.total,
        paidAt: new Date(),
      });
    }
  }

  // Everything was covered by discounts — nothing left to charge.
  if (lineItems.length === 0) {
    revalidatePath("/bookings");
    redirect("/bookings?paid=1");
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: profile.email,
    line_items: lineItems,
    success_url: `${appUrl()}/bookings?paid=1`,
    cancel_url: `${appUrl()}/bookings?canceled=1`,
    metadata: {
      kind: "drop_in",
      customer_id: userId,
      source: "customer-portal-balance",
      booking_count: String(lineItems.length),
    },
  });

  // Stamp the session id + the credit each charged booking will burn on
  // success (the webhook deducts sum(credit_applied_cents) for this session).
  for (const [bookingId, credit] of creditByBooking) {
    await svc
      .from("bookings")
      .update({
        payment_kind: "drop_in",
        stripe_checkout_session_id: session.id,
        credit_applied_cents: credit,
      })
      .eq("id", bookingId);
  }

  if (!session.url) {
    redirect(
      "/bookings?error=" +
        encodeURIComponent("Couldn't start payment — please contact us."),
    );
  }
  redirect(session.url);
}

function countNights(start: string, end: string): number {
  const [y1, m1, d1] = start.split("-").map(Number);
  const [y2, m2, d2] = end.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.max(0, Math.round((b - a) / 86400000));
}

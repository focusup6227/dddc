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
  refundFractionForBooking,
} from "@/lib/bookings.server";
import {
  calcCouponDiscount,
  lookupCoupon,
  settleUnpaidBookings,
} from "@/lib/coupons.server";
import { sendBookingConfirmation, sendPaymentReceipt } from "@/lib/email";
import {
  dogWashLineItem,
  getUnpaidAddonsForBookings,
  getUnpaidAddonsForCustomer,
  stampAddonSession,
} from "@/lib/addons.server";
import { getFullDates } from "@/lib/settings";
import { getBlackoutDates } from "@/lib/blackouts.server";
import { assertDogReadyToBook } from "@/lib/vaccines.server";
import { VACCINE_LABEL } from "@/lib/vaccines";
import { addDays, todayISO } from "@/lib/format";
import { appUrl, getStripe } from "@/lib/stripe";
import {
  cancelWaitlistEntry,
  createWaitlistEntry,
  enumerateDates,
  processWaitlist,
} from "@/lib/waitlist.server";
import type { Booking, BookingAddon, Dog, ServiceKind } from "@/lib/supabase/types";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  // The freed spot may belong to someone waiting — offer it to the next in line.
  try {
    await processWaitlist(
      booking.service_kind,
      enumerateDates(booking.service_date, booking.service_end_date),
    );
  } catch (e) {
    console.error("[waitlist] process after customer cancel failed", e);
  }

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
}

/**
 * Move a future, reserved day-care booking to a different date in place. The
 * price for a day-care day is flat, so the booking's payment (package day or
 * drop-in charge) carries over untouched — we only swap the date after
 * re-running the same gates a fresh booking must pass. Boarding isn't supported
 * here (date-range + per-night capacity makes an in-place move ambiguous).
 */
export async function rescheduleBooking(formData: FormData) {
  const { userId, profile } = await requireCustomer();
  const id = String(formData.get("id") ?? "");
  const newDate = String(formData.get("service_date") ?? "").trim();
  if (!id) redirect("/bookings");
  if (!ISO_RE.test(newDate)) {
    redirect("/bookings?error=" + encodeURIComponent("Pick a valid date."));
  }

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .eq("customer_id", userId)
    .maybeSingle<Booking>();
  if (!booking) redirect("/bookings");

  if (booking.service_kind !== "daycare") {
    redirect(
      "/bookings?error=" +
        encodeURIComponent("Only day care bookings can be rescheduled."),
    );
  }
  // Reschedule is for ordinary, not-yet-started reservations — not waitlist
  // holds, checked-in/out stays, or canceled rows.
  if (booking.status !== "reserved" || booking.waitlist_offer_expires_at) {
    redirect(
      "/bookings?error=" +
        encodeURIComponent("This booking can't be rescheduled."),
    );
  }
  const today = todayISO();
  if (booking.service_date < today) {
    redirect(
      "/bookings?error=" +
        encodeURIComponent("That booking has already started."),
    );
  }
  if (newDate < today) {
    redirect(
      "/bookings?error=" + encodeURIComponent("Pick a date in the future."),
    );
  }
  if (newDate === booking.service_date) {
    redirect("/bookings"); // No change — nothing to do.
  }

  // Vaccine gate for the new day.
  const vax = await assertDogReadyToBook(booking.dog_id, newDate);
  if (!vax.ok) {
    const missing = vax.missing.map((k) => VACCINE_LABEL[k]).join(", ");
    redirect(
      "/bookings?error=" +
        encodeURIComponent(`Upload these vaccine records first: ${missing}`),
    );
  }

  // Capacity on the new day (the dog's current booking is on the old day, so it
  // isn't double-counted here).
  const full = await getFullDates([newDate]);
  if (full.has(newDate)) {
    redirect(
      "/bookings?error=" +
        encodeURIComponent("That day is full — please pick another."),
    );
  }

  // Closures.
  const blackouts = await getBlackoutDates(newDate, addDays(newDate, 1), "daycare");
  if (blackouts.has(newDate)) {
    redirect(
      "/bookings?error=" +
        encodeURIComponent("We're closed that day — please pick another."),
    );
  }

  // The dog can't already have a live booking on the new day.
  const { data: conflict } = await supabase
    .from("bookings")
    .select("id")
    .eq("dog_id", booking.dog_id)
    .eq("service_date", newDate)
    .neq("status", "canceled")
    .neq("id", id)
    .maybeSingle<{ id: string }>();
  if (conflict) {
    redirect(
      "/bookings?error=" +
        encodeURIComponent("This dog already has a booking that day."),
    );
  }

  const oldDate = booking.service_date;
  // A move within 24h of the original day incurs the same 50% late penalty a
  // cancellation would — otherwise rescheduling is a free loophole around it.
  const late = refundFractionForBooking(booking.service_date, "customer") === 0.5;
  const svc = createServiceClient();
  let lateApplied = false;

  if (late && booking.payment_kind === "drop_in" && booking.payment_status === "paid") {
    // Forfeit 50% of what they paid: keep the charge (no card refund), credit
    // the other half to their account, and rebook the new day as unpaid so the
    // credit auto-applies — they owe the remaining 50% to confirm.
    const penaltyCredit = Math.round((booking.unit_price_cents ?? 0) * 0.5);
    await svc
      .from("bookings")
      .update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
        canceled_by: userId,
        cancellation_reason: `Rescheduled to ${newDate} (within 24h — 50% kept, 50% credited)`,
        refund_amount_cents: 0,
      })
      .eq("id", id);
    if (penaltyCredit > 0) {
      const { data: prof } = await svc
        .from("profiles")
        .select("account_credit_cents")
        .eq("id", userId)
        .maybeSingle<{ account_credit_cents: number }>();
      await svc
        .from("profiles")
        .update({
          account_credit_cents: (prof?.account_credit_cents ?? 0) + penaltyCredit,
        })
        .eq("id", userId);
    }
    await svc.from("bookings").insert({
      customer_id: userId,
      dog_id: booking.dog_id,
      service_date: newDate,
      service_end_date: addDays(newDate, 1),
      drop_off_time: booking.drop_off_time,
      pickup_time: booking.pickup_time,
      status: "reserved",
      payment_kind: "drop_in",
      unit_price_cents: booking.unit_price_cents,
      payment_status: "unpaid",
    });
    lateApplied = true;
  } else {
    // Move in place. Free when >24h out; for a late package-funded move we
    // additionally debit a half day below as the penalty.
    const { error } = await supabase
      .from("bookings")
      .update({ service_date: newDate, service_end_date: addDays(newDate, 1) })
      .eq("id", id)
      .eq("customer_id", userId);
    if (error) {
      redirect(
        "/bookings?error=" +
          encodeURIComponent("Couldn't reschedule — please try again."),
      );
    }

    if (late && booking.payment_kind === "package" && booking.customer_package_id) {
      const { data: pkg } = await svc
        .from("customer_packages")
        .select("id, days_remaining")
        .eq("id", booking.customer_package_id)
        .maybeSingle<{ id: string; days_remaining: number }>();
      if (pkg) {
        await svc
          .from("customer_packages")
          .update({ days_remaining: Math.max(0, pkg.days_remaining - 0.5) })
          .eq("id", pkg.id);
        lateApplied = true;
      }
    }
  }

  // The old day just freed up — offer it to anyone waiting.
  try {
    await processWaitlist("daycare", enumerateDates(oldDate, addDays(oldDate, 1)));
  } catch (e) {
    console.error("[waitlist] process after reschedule failed", e);
  }

  // Confirm the new date for moves that don't leave a balance to settle (the
  // late drop-in case is unpaid — the balance banner + pay flow cover it).
  if (!(late && booking.payment_kind === "drop_in" && booking.payment_status === "paid")) {
    const { data: dog } = await supabase
      .from("dogs")
      .select("name")
      .eq("id", booking.dog_id)
      .maybeSingle<{ name: string }>();
    const isPackage = booking.payment_kind === "package";
    await sendBookingConfirmation({
      to: profile.email,
      customerName: profile.full_name || profile.email,
      dogName: dog?.name ?? "your dog",
      dates: [newDate],
      paidByPackageCount: isPackage ? 1 : 0,
      dropInCount: isPackage ? 0 : 1,
      dropInTotalCents: isPackage ? 0 : booking.unit_price_cents ?? 0,
    });
  }

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  redirect(`/bookings?${lateApplied ? "rescheduled_late=1" : "rescheduled=1"}`);
}

/** Join the waitlist for a full daycare day or boarding span. */
export async function joinWaitlist(formData: FormData) {
  const { userId } = await requireCustomer();
  const dog_id = String(formData.get("dog_id") ?? "");
  const kind = (String(formData.get("kind") ?? "daycare") === "boarding"
    ? "boarding"
    : "daycare") as ServiceKind;
  const backTo = kind === "boarding" ? "/board" : "/book";

  let serviceDate: string;
  let serviceEndDate: string;
  if (kind === "boarding") {
    serviceDate = String(formData.get("check_in") ?? "");
    serviceEndDate = String(formData.get("check_out") ?? "");
  } else {
    serviceDate = String(formData.get("service_date") ?? "");
    serviceEndDate = addDays(serviceDate, 1);
  }
  if (!dog_id || !ISO_RE.test(serviceDate) || !ISO_RE.test(serviceEndDate)) {
    redirect(`${backTo}?error=${encodeURIComponent("Pick a dog and a valid date.")}`);
  }

  const result = await createWaitlistEntry({
    customerId: userId,
    dogId: dog_id,
    kind,
    serviceDate,
    serviceEndDate,
  });
  if (!result.ok) {
    redirect(`${backTo}?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath(backTo);
  revalidatePath("/bookings");
  redirect(`${backTo}?waitlisted=1`);
}

/** Leave the waitlist, or decline a live offer. */
export async function leaveWaitlistEntry(formData: FormData) {
  const { userId } = await requireCustomer();
  const entry_id = String(formData.get("entry_id") ?? "");
  if (!entry_id) redirect("/bookings");

  const freed = await cancelWaitlistEntry({ entryId: entry_id, customerId: userId });
  // Declining an offer frees the held spot — roll it to the next person.
  if (freed) {
    try {
      await processWaitlist(freed.kind, freed.dates);
    } catch (e) {
      console.error("[waitlist] process after decline failed", e);
    }
  }

  revalidatePath("/bookings");
  revalidatePath("/book");
  revalidatePath("/board");
  redirect("/bookings?left_waitlist=1");
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
 * Pay an unpaid dog wash that's stranded on an already-paid booking (e.g. an
 * add-later checkout the customer abandoned). The wash is its own $10 charge,
 * so it gets its own wash-only Checkout.
 */
export async function payDogWash(formData: FormData) {
  const { userId, profile } = await requireCustomer();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/bookings");

  const svc = createServiceClient();
  const { data: booking } = await svc
    .from("bookings")
    .select("id")
    .eq("id", id)
    .eq("customer_id", userId)
    .maybeSingle<{ id: string }>();
  if (!booking) redirect("/bookings");

  const washes = await getUnpaidAddonsForBookings(svc, [id]);
  const url = await startWashCheckout(svc, {
    customerId: userId,
    customerEmail: profile.email,
    washes,
  });
  if (!url) {
    redirect("/bookings?error=" + encodeURIComponent("Nothing to pay."));
  }
  redirect(url);
}

/**
 * Build a wash-only Stripe Checkout for a set of unpaid add-ons and point them
 * at it. Returns the session URL, or null when there's nothing to charge.
 */
async function startWashCheckout(
  svc: ReturnType<typeof createServiceClient>,
  args: { customerId: string; customerEmail: string; washes: BookingAddon[] },
): Promise<string | null> {
  if (args.washes.length === 0) return null;

  const bookingIds = Array.from(new Set(args.washes.map((w) => w.booking_id)));
  const { data: brows } = await svc
    .from("bookings")
    .select("id, dog_id")
    .in("id", bookingIds);
  const dogIdByBooking = new Map(
    ((brows ?? []) as { id: string; dog_id: string }[]).map((b) => [b.id, b.dog_id]),
  );
  const dogIds = Array.from(new Set(Array.from(dogIdByBooking.values())));
  const { data: drows } = dogIds.length
    ? await svc.from("dogs").select("id, name").in("id", dogIds)
    : { data: [] };
  const nameByDog = new Map(
    ((drows ?? []) as Pick<Dog, "id" | "name">[]).map((d) => [d.id, d.name]),
  );

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: args.customerEmail,
    line_items: args.washes.map((w) =>
      dogWashLineItem(nameByDog.get(dogIdByBooking.get(w.booking_id) ?? "") ?? "your dog"),
    ),
    success_url: `${appUrl()}/bookings?paid=1`,
    cancel_url: `${appUrl()}/bookings?canceled=1`,
    metadata: { kind: "addon", customer_id: args.customerId, source: "customer-portal" },
  });
  await stampAddonSession(
    svc,
    args.washes.map((a) => a.id),
    session.id,
  );
  return session.url ?? null;
}

/**
 * Pay every unpaid booking for the customer in a single Stripe Checkout
 * session. The session id is stamped on each row so the existing webhook
 * marks them all paid in one shot. Unpaid dog washes — including any stranded
 * on already-paid stays — are bundled in so the charge matches the balance.
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
    // Waitlist offers are optional, time-limited holds — claimed explicitly via
    // their own button, never force-swept into "pay everything".
    .is("waitlist_offer_expires_at", null)
    .order("service_date");
  const unpaid = (bookingRows ?? []) as Booking[];

  // All unpaid washes for the customer; "stranded" ones ride on a stay that's
  // already paid, so the booking flows below won't pick them up on their own.
  const allWashes = await getUnpaidAddonsForCustomer(svc, userId);
  const unpaidIds = new Set(unpaid.map((b) => b.id));
  const strandedWashes = allWashes.filter((a) => !unpaidIds.has(a.booking_id));

  if (unpaid.length === 0 && allWashes.length === 0) {
    redirect("/bookings?error=Nothing+to+pay.");
  }

  // Nothing but washes left to pay — wash-only checkout.
  if (unpaid.length === 0) {
    const url = await startWashCheckout(svc, {
      customerId: userId,
      customerEmail: profile.email,
      washes: allWashes,
    });
    if (!url) {
      redirect(
        "/bookings?error=" +
          encodeURIComponent("Couldn't start payment — please contact us."),
      );
    }
    redirect(url);
  }

  // A single unpaid booking with no stranded washes → reuse the single-booking
  // flow (keeps the pre-made Stripe price IDs; it bundles that booking's wash).
  if (unpaid.length === 1 && strandedWashes.length === 0) {
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

  // Dog names cover both the unpaid stays and any stranded-wash bookings.
  const washBookingIds = Array.from(new Set(allWashes.map((a) => a.booking_id)));
  const { data: washBookingRows } = washBookingIds.length
    ? await svc.from("bookings").select("id, dog_id").in("id", washBookingIds)
    : { data: [] };
  const dogIdByBooking = new Map<string, string>();
  for (const b of unpaid) dogIdByBooking.set(b.id, b.dog_id);
  for (const b of (washBookingRows ?? []) as { id: string; dog_id: string }[]) {
    dogIdByBooking.set(b.id, b.dog_id);
  }
  const dogIds = Array.from(new Set(Array.from(dogIdByBooking.values())));
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

  // Bundle every unpaid dog wash (stays + stranded) into the same checkout, so
  // the charge matches the displayed balance. The webhook flips them by session
  // id once payment lands.
  for (const addon of allWashes) {
    const dogId = dogIdByBooking.get(addon.booking_id);
    lineItems.push(dogWashLineItem(dogName.get(dogId ?? "") ?? "your dog"));
  }

  // Everything was covered by discounts and there's no wash — nothing to charge.
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

  await stampAddonSession(
    svc,
    allWashes.map((a) => a.id),
    session.id,
  );

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

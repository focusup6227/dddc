"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { requireFullStaff } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { appUrl, getStripe } from "@/lib/stripe";
import { addDays, todayISO } from "@/lib/format";
import {
  sendBookingConfirmation,
  sendPackageLowAlert,
  sendPaymentReceipt,
} from "@/lib/email";
import { settleUnpaidBookings } from "@/lib/coupons.server";
import {
  BOARDING_STRIPE_PRICE_AMOUNT_CENTS,
  BOARDING_STRIPE_PRICE_ID,
  getBoardingRateCents,
} from "@/lib/settings";
import { isTimeInWindow } from "@/lib/hours";
import { createBookingCheckoutSession } from "@/lib/bookings.server";
import { addDogWash, dogWashLineItem } from "@/lib/addons.server";
import { consumePackageDay } from "@/lib/packageAllocation";
import {
  addBelonging,
  getBelongings,
  lastStayBelongings,
  removeBelonging,
  returnAllBelongings,
  setBelongingReturned,
} from "@/lib/belongings.server";
import type {
  Belonging,
  Booking,
  BookingAddon,
  CheckIn,
  CustomerPackage,
  Dog,
  Package,
  Profile,
} from "@/lib/supabase/types";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function kioskCheckIn(formData: FormData) {
  const { userId } = await requireFullStaff();
  const booking_id = String(formData.get("booking_id") ?? "");
  if (!booking_id) redirect("/kiosk");

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("check_ins")
    .select("*")
    .eq("booking_id", booking_id)
    .maybeSingle<CheckIn>();

  if (existing) {
    await supabase
      .from("check_ins")
      .update({ checked_in_at: new Date().toISOString(), checked_in_by: userId })
      .eq("booking_id", booking_id);
  } else {
    await supabase.from("check_ins").insert({
      booking_id,
      checked_in_at: new Date().toISOString(),
      checked_in_by: userId,
    });
  }
  await supabase.from("bookings").update({ status: "checked_in" }).eq("id", booking_id);

  // Checking in is the moment the dog's stuff comes through the door, so make
  // logging belongings a deliberate step rather than a section staff might
  // scroll past. The step screen has its own "Done" exit back to today.
  revalidatePath("/kiosk");
  redirect(`/kiosk/booking/${booking_id}/belongings`);
}

export async function kioskCheckOut(formData: FormData) {
  const { userId } = await requireFullStaff();
  const booking_id = String(formData.get("booking_id") ?? "");
  if (!booking_id) redirect("/kiosk");

  const supabase = await createClient();
  await supabase
    .from("check_ins")
    .update({ checked_out_at: new Date().toISOString(), checked_out_by: userId })
    .eq("booking_id", booking_id);
  await supabase.from("bookings").update({ status: "checked_out" }).eq("id", booking_id);

  revalidatePath("/kiosk");
  redirect("/kiosk");
}

/**
 * Walk-in: create a same-day drop-in booking for an existing customer + dog,
 * then redirect to a Stripe Checkout session. Webhook flips it to paid.
 */
export async function kioskWalkInCharge(formData: FormData) {
  await requireFullStaff();
  const customer_id = String(formData.get("customer_id") ?? "");
  const dog_id = String(formData.get("dog_id") ?? "");
  if (!customer_id || !dog_id) {
    redirect("/kiosk/walk-in?error=Missing+customer+or+dog");
  }

  const svc = createServiceClient();

  const [{ data: dog }, { data: profile }, { data: dropInPkg }] = await Promise.all([
    svc.from("dogs").select("*").eq("id", dog_id).maybeSingle<Dog>(),
    svc.from("profiles").select("*").eq("id", customer_id).maybeSingle<Profile>(),
    svc
      .from("packages")
      .select("*")
      .eq("active", true)
      .eq("days_included", 1)
      .order("price_cents")
      .limit(1)
      .maybeSingle<Package>(),
  ]);

  if (!dog || dog.owner_id !== customer_id) {
    redirect("/kiosk/walk-in?error=Dog+does+not+belong+to+customer");
  }
  if (!profile) {
    redirect("/kiosk/walk-in?error=Customer+not+found");
  }
  if (!dropInPkg) {
    redirect("/kiosk/walk-in?error=No+drop-in+rate+configured");
  }

  const today = todayISO();

  // If they already have a paid booking today, just redirect to it.
  const { data: existing } = await svc
    .from("bookings")
    .select("*")
    .eq("dog_id", dog_id)
    .eq("service_date", today)
    .neq("status", "canceled")
    .maybeSingle<Booking>();

  if (existing && existing.payment_status === "paid") {
    redirect(`/kiosk/booking/${existing.id}`);
  }

  const stripe = getStripe();
  const walkInLineItem = dropInPkg!.stripe_price_id
    ? { price: dropInPkg!.stripe_price_id, quantity: 1 }
    : {
        price_data: {
          currency: "usd" as const,
          product_data: {
            name: `Day care drop-in (${dog!.name})`,
            description: `Walk-in · ${today}`,
          },
          unit_amount: dropInPkg!.price_cents,
        },
        quantity: 1,
      };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: profile!.email,
    line_items: [walkInLineItem],
    success_url: `${appUrl()}/kiosk?paid=1`,
    cancel_url: `${appUrl()}/kiosk?canceled=1`,
    metadata: {
      kind: "drop_in",
      customer_id,
      dog_id,
      service_dates: today,
      source: "kiosk",
    },
  });

  // Pre-create / reuse the booking row tied to this session.
  if (existing) {
    await svc
      .from("bookings")
      .update({
        payment_kind: "drop_in",
        unit_price_cents: dropInPkg!.price_cents,
        stripe_checkout_session_id: session.id,
        payment_status: "unpaid",
        status: "reserved",
      })
      .eq("id", existing.id);
  } else {
    await svc.from("bookings").insert({
      customer_id,
      dog_id,
      service_date: today,
      service_end_date: addDays(today, 1),
      status: "reserved",
      payment_kind: "drop_in",
      unit_price_cents: dropInPkg!.price_cents,
      stripe_checkout_session_id: session.id,
      payment_status: "unpaid",
    });
  }

  if (!session.url) redirect("/kiosk/walk-in?error=Stripe+session+failed");
  redirect(session.url);
}

/**
 * Future booking initiated by staff at the kiosk on behalf of any
 * existing customer. Mirrors the customer-side createBooking but takes
 * customer_id explicitly and skips the capacity hard-block (staff
 * already saw the in-page warning and chose to override).
 */
export async function kioskCreateBooking(formData: FormData) {
  await requireFullStaff();
  const customer_id = String(formData.get("customer_id") ?? "");
  const dog_id = String(formData.get("dog_id") ?? "");
  const datesRaw = String(formData.get("service_dates") ?? "");
  const dates = Array.from(
    new Set(
      datesRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => ISO_RE.test(s)),
    ),
  ).sort();
  const drop_off_time = String(formData.get("drop_off_time") ?? "");
  const pickup_time = String(formData.get("pickup_time") ?? "");
  const dogWash = String(formData.get("dog_wash") ?? "") === "1";

  if (!customer_id || !dog_id || dates.length === 0) {
    redirect(
      `/kiosk/booking/new?customer=${customer_id}&error=${encodeURIComponent("Pick a dog and at least one day.")}`,
    );
  }
  if (
    !isTimeInWindow(drop_off_time) ||
    !isTimeInWindow(pickup_time) ||
    pickup_time <= drop_off_time
  ) {
    redirect(
      `/kiosk/booking/new?customer=${customer_id}&error=${encodeURIComponent("Pick a drop-off and pickup between 6 AM and 6 PM.")}`,
    );
  }

  const svc = createServiceClient();

  const [{ data: dog }, { data: profile }] = await Promise.all([
    svc.from("dogs").select("*").eq("id", dog_id).maybeSingle<Dog>(),
    svc.from("profiles").select("*").eq("id", customer_id).maybeSingle<Profile>(),
  ]);
  if (!dog || dog.owner_id !== customer_id) {
    redirect(`/kiosk/booking/new?customer=${customer_id}&error=Dog+not+found`);
  }
  if (!profile) {
    redirect(`/kiosk/booking/new?error=Customer+not+found`);
  }

  // Paid packages with any remaining balance, FIFO. Fractional balances (from a
  // late-reschedule half-day penalty) cover part of a day; the rest is cash.
  const { data: pkgRows } = await svc
    .from("customer_packages")
    .select("*")
    .eq("customer_id", customer_id)
    .eq("payment_status", "paid")
    .gt("days_remaining", 0)
    .order("created_at");
  const packages = (pkgRows ?? []) as CustomerPackage[];
  const startBalances = new Map(packages.map((p) => [p.id, p.days_remaining]));

  const perDay = dates.map((date) => {
    const { chargeFraction, consumed } = consumePackageDay(packages);
    return { date, chargeFraction, consumed };
  });
  const packageAllocs = perDay.filter((a) => a.chargeFraction === 0);
  const dropInAllocs = perDay.filter((a) => a.chargeFraction > 0);

  let dropInPriceCents: number | null = null;
  let dropInPriceId: string | null = null;
  if (dropInAllocs.length > 0) {
    const { data: dropInPkg } = await svc
      .from("packages")
      .select("*")
      .eq("active", true)
      .eq("days_included", 1)
      .order("price_cents")
      .limit(1)
      .maybeSingle<Package>();
    if (!dropInPkg) {
      redirect(
        `/kiosk/booking/new?customer=${customer_id}&error=No+drop-in+rate+configured`,
      );
    }
    dropInPriceCents = dropInPkg!.price_cents;
    dropInPriceId = dropInPkg!.stripe_price_id;
  }
  const chargeCentsFor = (fraction: number) =>
    Math.round((dropInPriceCents ?? 0) * fraction);

  // Insert package-funded (fully covered) bookings. Primary package recorded;
  // balances persisted once below.
  const confirmedPackageDates: string[] = [];
  const touchedPackageIds = new Set<string>();
  let firstPackageBookingId: string | null = null;
  for (const a of packageAllocs) {
    const primaryPkgId = a.consumed[0]!.id;
    const { data: inserted, error: insErr } = await svc
      .from("bookings")
      .insert({
        customer_id,
        dog_id,
        service_date: a.date,
        service_end_date: addDays(a.date, 1),
        drop_off_time,
        pickup_time,
        status: "reserved",
        payment_kind: "package",
        customer_package_id: primaryPkgId,
        package_days_used: 1,
        payment_status: "paid",
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (insErr) {
      if (!insErr.message.toLowerCase().includes("duplicate")) {
        redirect(
          `/kiosk/booking/new?customer=${customer_id}&error=${encodeURIComponent(insErr.message)}`,
        );
      }
      continue;
    }
    if (inserted && !firstPackageBookingId) firstPackageBookingId = inserted.id;
    confirmedPackageDates.push(a.date);
    for (const c of a.consumed) touchedPackageIds.add(c.id);
  }

  // Persist every package balance that changed.
  for (const pkg of packages) {
    if (startBalances.get(pkg.id) !== pkg.days_remaining) {
      touchedPackageIds.add(pkg.id);
      await svc
        .from("customer_packages")
        .update({ days_remaining: pkg.days_remaining })
        .eq("id", pkg.id);
    }
  }

  if (confirmedPackageDates.length > 0) {
    await sendBookingConfirmation({
      to: profile!.email,
      customerName: profile!.full_name ?? profile!.email,
      dogName: dog!.name,
      dates: confirmedPackageDates,
      paidByPackageCount: confirmedPackageDates.length,
      dropInCount: 0,
      dropInTotalCents: 0,
    });
  }
  await maybeSendPackageLowAlerts(svc, customer_id, profile!.email, profile!.full_name, touchedPackageIds);

  // "Pay at pickup": book everything now but collect cash/card later. Charged
  // days become unpaid reservations with no Stripe session; a wash rides along
  // as an unpaid add-on. Staff settle it at pickup via the normal take-payment
  // flow on the booking. No redirect to Stripe.
  const deferPayment = String(formData.get("defer") ?? "") === "1";
  if (deferPayment) {
    let firstDropInId: string | null = null;
    let deferredTotal = 0;
    const deferredDates: string[] = [];
    for (const a of dropInAllocs) {
      const cents = chargeCentsFor(a.chargeFraction);
      const { data: inserted } = await svc
        .from("bookings")
        .insert({
          customer_id,
          dog_id,
          service_date: a.date,
          service_end_date: addDays(a.date, 1),
          drop_off_time,
          pickup_time,
          status: "reserved",
          payment_kind: "drop_in",
          customer_package_id: a.consumed[0]?.id ?? null,
          package_days_used: Math.round((1 - a.chargeFraction) * 10) / 10,
          unit_price_cents: cents,
          stripe_checkout_session_id: null,
          payment_status: "unpaid",
        })
        .select("id")
        .maybeSingle<{ id: string }>();
      if (inserted && !firstDropInId) firstDropInId = inserted.id;
      deferredTotal += cents;
      deferredDates.push(a.date);
    }
    const washHost = firstDropInId ?? firstPackageBookingId;
    if (dogWash && washHost) {
      await addDogWash(svc, {
        bookingId: washHost,
        customerId: customer_id,
        sessionId: null,
      });
    }
    if (deferredDates.length > 0) {
      await sendBookingConfirmation({
        to: profile!.email,
        customerName: profile!.full_name ?? profile!.email,
        dogName: dog!.name,
        dates: deferredDates,
        paidByPackageCount: 0,
        dropInCount: deferredDates.length,
        dropInTotalCents: deferredTotal,
      });
    }
    redirect("/kiosk?booked=1");
  }

  const stripe = getStripe();

  if (dropInAllocs.length === 0) {
    // All days package-covered, but a wash still needs paying.
    if (dogWash && firstPackageBookingId) {
      const washSession = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: profile!.email,
        line_items: [dogWashLineItem(dog!.name)],
        success_url: `${appUrl()}/kiosk?paid=1`,
        cancel_url: `${appUrl()}/kiosk?canceled=1`,
        metadata: { kind: "addon", customer_id, dog_id, source: "kiosk" },
      });
      await addDogWash(svc, {
        bookingId: firstPackageBookingId,
        customerId: customer_id,
        sessionId: washSession.id,
      });
      if (!washSession.url) {
        redirect(`/kiosk/booking/new?customer=${customer_id}&error=Stripe+session+failed`);
      }
      redirect(washSession.url);
    }
    redirect("/kiosk?paid=1");
  }

  // Stripe checkout for charged days — grouped by price so full ($25) and
  // partial ($12.50, package-credit-applied) days each get a line item.
  const fullCents = dropInPriceCents!;
  const byCharge = new Map<number, typeof dropInAllocs>();
  for (const a of dropInAllocs) {
    const cents = chargeCentsFor(a.chargeFraction);
    const arr = byCharge.get(cents) ?? [];
    arr.push(a);
    byCharge.set(cents, arr);
  }
  const kioskLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  for (const [cents, group] of byCharge) {
    const partial = cents < fullCents;
    if (!partial && dropInPriceId) {
      kioskLineItems.push({ price: dropInPriceId, quantity: group.length });
    } else {
      kioskLineItems.push({
        price_data: {
          currency: "usd" as const,
          product_data: {
            name: partial
              ? `Day care (${dog!.name}) — package credit applied`
              : `Day care drop-in (${dog!.name})`,
            description: `Service dates: ${group.map((a) => a.date).join(", ")}`,
          },
          unit_amount: cents,
        },
        quantity: group.length,
      });
    }
  }
  if (dogWash) kioskLineItems.push(dogWashLineItem(dog!.name));
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: profile!.email,
    line_items: kioskLineItems,
    success_url: `${appUrl()}/kiosk?paid=1`,
    cancel_url: `${appUrl()}/kiosk?canceled=1`,
    metadata: {
      kind: "drop_in",
      customer_id,
      dog_id,
      service_dates: dropInAllocs.map((a) => a.date).join(","),
      source: "kiosk",
    },
  });

  let firstDropInBookingId: string | null = null;
  for (const a of dropInAllocs) {
    const { data: inserted } = await svc
      .from("bookings")
      .insert({
        customer_id,
        dog_id,
        service_date: a.date,
        service_end_date: addDays(a.date, 1),
        drop_off_time,
        pickup_time,
        status: "reserved",
        payment_kind: "drop_in",
        customer_package_id: a.consumed[0]?.id ?? null,
        package_days_used: Math.round((1 - a.chargeFraction) * 10) / 10,
        unit_price_cents: chargeCentsFor(a.chargeFraction),
        stripe_checkout_session_id: session.id,
        payment_status: "unpaid",
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (inserted && !firstDropInBookingId) firstDropInBookingId = inserted.id;
  }

  if (dogWash && firstDropInBookingId) {
    await addDogWash(svc, {
      bookingId: firstDropInBookingId,
      customerId: customer_id,
      sessionId: session.id,
    });
  }

  if (!session.url) {
    redirect(`/kiosk/booking/new?customer=${customer_id}&error=Stripe+session+failed`);
  }
  redirect(session.url);
}

async function maybeSendPackageLowAlerts(
  svc: ReturnType<typeof createServiceClient>,
  customerId: string,
  email: string,
  customerName: string | null,
  touchedPackageIds: Set<string>,
) {
  if (touchedPackageIds.size === 0) return;
  const ids = Array.from(touchedPackageIds);
  const { data: rows } = await svc
    .from("customer_packages")
    .select("id, days_remaining, package_id")
    .in("id", ids);
  const lowOnes = (rows ?? []).filter((r) => r.days_remaining === 1);
  if (lowOnes.length === 0) return;
  const pkgIds = Array.from(new Set(lowOnes.map((r) => r.package_id)));
  const { data: catalog } = await svc.from("packages").select("id, name").in("id", pkgIds);
  const nameById = new Map((catalog ?? []).map((p) => [p.id, p.name]));
  for (const r of lowOnes) {
    await sendPackageLowAlert({
      to: email,
      customerName: customerName ?? email,
      packageName: nameById.get(r.package_id) ?? "Day care package",
      daysRemaining: r.days_remaining,
    });
  }
}

// "Pay by phone": when a payment is initiated with via=qr, the customer scans
// a QR of the Checkout URL and pays on their own phone. Their phone lands on a
// public /pay-complete page after; the kiosk screen polls the session and shows
// the ✓. Without via=qr, payment happens on the kiosk screen exactly as before.
function isQrPay(formData: FormData): boolean {
  return String(formData.get("via") ?? "") === "qr";
}
function qrSuccessUrls() {
  return {
    successUrl: `${appUrl()}/pay-complete`,
    cancelUrl: `${appUrl()}/pay-complete?canceled=1`,
  };
}
function qrPayPath(checkoutUrl: string): string {
  return `/kiosk/pay?u=${encodeURIComponent(checkoutUrl)}`;
}

/**
 * Take payment for an existing booking that's still unpaid.
 * Re-creates a Stripe Checkout session and redirects — to the on-screen hosted
 * checkout, or (via=qr) to a scan-to-pay screen the customer uses on their phone.
 */
export async function kioskTakePayment(formData: FormData) {
  await requireFullStaff();
  const booking_id = String(formData.get("booking_id") ?? "");
  if (!booking_id) redirect("/kiosk");
  const qr = isQrPay(formData);

  const url = await createBookingCheckoutSession({
    bookingId: booking_id,
    ...(qr
      ? qrSuccessUrls()
      : {
          successUrl: `${appUrl()}/kiosk?paid=1`,
          cancelUrl: `${appUrl()}/kiosk?canceled=1`,
        }),
    source: "kiosk",
  });
  if (!url) redirect("/kiosk?canceled=1");
  redirect(qr ? qrPayPath(url) : url);
}

/**
 * Staff creates a multi-night boarding stay on behalf of a customer.
 * Mirrors the customer-side /board flow but takes customer_id explicitly
 * and skips the waiver hard-block (staff already saw the in-page warning).
 */
export async function kioskCreateBoarding(formData: FormData) {
  await requireFullStaff();
  const customer_id = String(formData.get("customer_id") ?? "");
  const dog_id = String(formData.get("dog_id") ?? "");
  const checkIn = String(formData.get("check_in") ?? "");
  const checkOut = String(formData.get("check_out") ?? "");
  const drop_off_time = String(formData.get("drop_off_time") ?? "");
  const pickup_time = String(formData.get("pickup_time") ?? "");
  const dogWash = String(formData.get("dog_wash") ?? "") === "1";

  if (
    !customer_id ||
    !dog_id ||
    !ISO_RE.test(checkIn) ||
    !ISO_RE.test(checkOut) ||
    checkOut <= checkIn
  ) {
    redirect(
      `/kiosk/boarding/new?customer=${customer_id}&error=Pick+a+dog+and+valid+dates`,
    );
  }
  if (!isTimeInWindow(drop_off_time) || !isTimeInWindow(pickup_time)) {
    redirect(
      `/kiosk/boarding/new?customer=${customer_id}&error=${encodeURIComponent("Pick a drop-off and pickup between 6 AM and 6 PM.")}`,
    );
  }

  const nights: string[] = [];
  let cur = checkIn;
  while (cur < checkOut && nights.length < 30) {
    nights.push(cur);
    cur = addDays(cur, 1);
  }
  if (nights.length === 0) {
    redirect(`/kiosk/boarding/new?customer=${customer_id}&error=Pick+at+least+one+night`);
  }

  const svc = createServiceClient();

  const [{ data: dog }, { data: profile }] = await Promise.all([
    svc.from("dogs").select("*").eq("id", dog_id).maybeSingle<Dog>(),
    svc.from("profiles").select("*").eq("id", customer_id).maybeSingle<Profile>(),
  ]);
  if (!dog || dog.owner_id !== customer_id) {
    redirect(`/kiosk/boarding/new?customer=${customer_id}&error=Dog+not+found`);
  }
  if (!profile) {
    redirect(`/kiosk/boarding/new?error=Customer+not+found`);
  }

  const rateCents = await getBoardingRateCents();

  // "Pay at pickup": create the stay as an unpaid reservation with no Stripe
  // session and settle it when the dog is collected, via the normal
  // take-payment flow. No redirect to Stripe.
  const deferPayment = String(formData.get("defer") ?? "") === "1";
  if (deferPayment) {
    const { data: stay } = await svc
      .from("bookings")
      .insert({
        customer_id,
        dog_id,
        service_date: checkIn,
        service_end_date: checkOut,
        drop_off_time,
        pickup_time,
        service_kind: "boarding",
        status: "reserved",
        payment_kind: "drop_in",
        unit_price_cents: rateCents,
        stripe_checkout_session_id: null,
        payment_status: "unpaid",
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (dogWash && stay) {
      await addDogWash(svc, {
        bookingId: stay.id,
        customerId: customer_id,
        sessionId: null,
      });
    }
    await sendBookingConfirmation({
      to: profile!.email,
      customerName: profile!.full_name ?? profile!.email,
      dogName: dog!.name,
      dates: nights,
      paidByPackageCount: 0,
      dropInCount: nights.length,
      dropInTotalCents: rateCents * nights.length,
    });
    redirect("/kiosk?booked=1");
  }

  const useStripeId = rateCents === BOARDING_STRIPE_PRICE_AMOUNT_CENTS;

  const stripe = getStripe();
  const lineItem = useStripeId
    ? { price: BOARDING_STRIPE_PRICE_ID, quantity: nights.length }
    : {
        price_data: {
          currency: "usd" as const,
          product_data: {
            name: `Boarding (${dog!.name})`,
            description: `${nights.length} night${nights.length === 1 ? "" : "s"}: ${checkIn} → ${checkOut}`,
          },
          unit_amount: rateCents,
        },
        quantity: nights.length,
      };

  const boardingLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    lineItem,
  ];
  if (dogWash) boardingLineItems.push(dogWashLineItem(dog!.name));
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: profile!.email,
    line_items: boardingLineItems,
    success_url: `${appUrl()}/kiosk?paid=1`,
    cancel_url: `${appUrl()}/kiosk?canceled=1`,
    metadata: {
      kind: "boarding",
      customer_id,
      dog_id,
      service_dates: nights.join(","),
      source: "kiosk",
    },
  });

  // One row per stay covering [checkIn, checkOut).
  const { data: stay } = await svc
    .from("bookings")
    .insert({
      customer_id,
      dog_id,
      service_date: checkIn,
      service_end_date: checkOut,
      drop_off_time,
      pickup_time,
      service_kind: "boarding",
      status: "reserved",
      payment_kind: "drop_in",
      unit_price_cents: rateCents,
      stripe_checkout_session_id: session.id,
      payment_status: "unpaid",
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (dogWash && stay) {
    await addDogWash(svc, {
      bookingId: stay.id,
      customerId: customer_id,
      sessionId: session.id,
    });
  }

  if (!session.url) {
    redirect(`/kiosk/boarding/new?customer=${customer_id}&error=Stripe+session+failed`);
  }
  redirect(session.url);
}

/**
 * Add a dog wash to an existing booking and take payment for it right now.
 * Used when a customer decides on a wash at drop-off or pickup. The wash is
 * its own $10 charge, independent of whether the stay itself is already paid.
 */
export async function kioskAddDogWash(formData: FormData) {
  await requireFullStaff();
  const booking_id = String(formData.get("booking_id") ?? "");
  if (!booking_id) redirect("/kiosk");

  const svc = createServiceClient();
  const { data: booking } = await svc
    .from("bookings")
    .select("*")
    .eq("id", booking_id)
    .maybeSingle<Booking>();
  if (!booking || booking.status === "canceled") {
    redirect(`/kiosk/booking/${booking_id}?error=Booking+not+found`);
  }

  // Already has a paid wash? Nothing to do.
  const { data: existingPaid } = await svc
    .from("booking_addons")
    .select("id")
    .eq("booking_id", booking_id)
    .eq("kind", "dog_wash")
    .eq("payment_status", "paid")
    .maybeSingle();
  if (existingPaid) {
    redirect(
      `/kiosk/booking/${booking_id}?error=${encodeURIComponent("Dog wash already paid.")}`,
    );
  }

  const [{ data: dog }, { data: cust }] = await Promise.all([
    svc.from("dogs").select("name").eq("id", booking!.dog_id).maybeSingle<{ name: string }>(),
    svc
      .from("profiles")
      .select("email")
      .eq("id", booking!.customer_id)
      .maybeSingle<{ email: string }>(),
  ]);

  // Clear any stale unpaid wash so we never end up with two live ones.
  await svc
    .from("booking_addons")
    .delete()
    .eq("booking_id", booking_id)
    .eq("kind", "dog_wash")
    .eq("payment_status", "unpaid");

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: cust?.email,
    line_items: [dogWashLineItem(dog?.name ?? "your dog")],
    success_url: `${appUrl()}/kiosk/booking/${booking_id}?paid=1`,
    cancel_url: `${appUrl()}/kiosk/booking/${booking_id}?canceled=1`,
    metadata: {
      kind: "addon",
      customer_id: booking!.customer_id,
      dog_id: booking!.dog_id,
      source: "kiosk",
    },
  });

  await addDogWash(svc, {
    bookingId: booking_id,
    customerId: booking!.customer_id,
    sessionId: session.id,
  });

  if (!session.url) {
    redirect(`/kiosk/booking/${booking_id}?error=Stripe+session+failed`);
  }
  redirect(session.url);
}

const MAX_STAY_NIGHTS = 30;

/**
 * Edit an existing booking's dates and times from the kiosk. For boarding both
 * the check-in and check-out dates move; for daycare the single service day
 * moves (its end stays check-in + 1). Capacity isn't hard-blocked — staff are
 * making a deliberate change. The bill is night-based, so an unpaid stay
 * re-prices automatically; an already-paid stay whose night count changes is
 * flagged in the UI for staff to settle the difference.
 */
export async function kioskUpdateStay(formData: FormData) {
  await requireFullStaff();
  const booking_id = String(formData.get("booking_id") ?? "");
  if (!booking_id) redirect("/kiosk");

  const svc = createServiceClient();
  const { data: booking } = await svc
    .from("bookings")
    .select("*")
    .eq("id", booking_id)
    .maybeSingle<Booking>();
  if (!booking || booking.status === "canceled") {
    redirect(`/kiosk/booking/${booking_id}?error=Booking+not+found`);
  }

  const drop_off_time = String(formData.get("drop_off_time") ?? "");
  const pickup_time = String(formData.get("pickup_time") ?? "");
  if (!isTimeInWindow(drop_off_time) || !isTimeInWindow(pickup_time)) {
    redirect(
      `/kiosk/booking/${booking_id}?error=${encodeURIComponent("Pick a drop-off and pickup between 6 AM and 6 PM.")}`,
    );
  }

  const serviceDate = String(formData.get("service_date") ?? "");
  if (!ISO_RE.test(serviceDate)) {
    redirect(`/kiosk/booking/${booking_id}?error=Pick+a+valid+date`);
  }

  const isBoarding = booking!.service_kind === "boarding";
  let serviceEndDate: string;
  if (isBoarding) {
    serviceEndDate = String(formData.get("service_end_date") ?? "");
    if (!ISO_RE.test(serviceEndDate) || serviceEndDate <= serviceDate) {
      redirect(
        `/kiosk/booking/${booking_id}?error=${encodeURIComponent("Check-out must be after check-in.")}`,
      );
    }
    let cur = serviceDate;
    let nights = 0;
    while (cur < serviceEndDate) {
      cur = addDays(cur, 1);
      nights += 1;
    }
    if (nights > MAX_STAY_NIGHTS) {
      redirect(
        `/kiosk/booking/${booking_id}?error=${encodeURIComponent(`Stays are capped at ${MAX_STAY_NIGHTS} nights.`)}`,
      );
    }
  } else {
    // Daycare: a single day, dropped off and picked up the same day.
    if (pickup_time <= drop_off_time) {
      redirect(
        `/kiosk/booking/${booking_id}?error=${encodeURIComponent("Pickup must be after drop-off.")}`,
      );
    }
    serviceEndDate = addDays(serviceDate, 1);
  }

  const { error } = await svc
    .from("bookings")
    .update({
      service_date: serviceDate,
      service_end_date: serviceEndDate,
      drop_off_time,
      pickup_time,
    })
    .eq("id", booking_id);
  if (error) {
    // Most likely a uniqueness clash (daycare dog already booked that day).
    const msg = error.message.toLowerCase().includes("duplicate")
      ? "That dog already has a booking on that day."
      : error.message;
    redirect(`/kiosk/booking/${booking_id}?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath(`/kiosk/booking/${booking_id}`);
  revalidatePath("/kiosk");
  redirect(`/kiosk/booking/${booking_id}?updated=1`);
}

/**
 * Remove a single charge (add-on line item) from a booking by its id. An unpaid
 * add-on — e.g. one added by mistake — is deleted outright; a paid one is
 * refunded to its payment intent and kept as a `refunded` record.
 */
export async function kioskRemoveAddon(formData: FormData) {
  await requireFullStaff();
  const addon_id = String(formData.get("addon_id") ?? "");
  if (!addon_id) redirect("/kiosk");

  const svc = createServiceClient();
  const { data: addon } = await svc
    .from("booking_addons")
    .select("*")
    .eq("id", addon_id)
    .maybeSingle<BookingAddon>();
  if (!addon) redirect("/kiosk");

  if (addon.payment_status === "paid") {
    if (addon.stripe_payment_intent_id) {
      const stripe = getStripe();
      await stripe.refunds.create({
        payment_intent: addon.stripe_payment_intent_id,
        amount: addon.amount_cents,
        reason: "requested_by_customer",
        metadata: {
          booking_id: addon.booking_id,
          addon_id: addon.id,
          removed: "kiosk",
        },
      });
    }
    await svc
      .from("booking_addons")
      .update({ payment_status: "refunded" })
      .eq("id", addon.id);
  } else if (addon.payment_status === "unpaid") {
    // Never charged — just drop it.
    await svc.from("booking_addons").delete().eq("id", addon.id);
  }
  // refunded / failed rows are left as-is.

  revalidatePath(`/kiosk/booking/${addon.booking_id}`);
  redirect(`/kiosk/booking/${addon.booking_id}?charge_removed=1`);
}

/** Billable units for a stay: nights for boarding, one day for daycare. */
function stayUnitsOf(b: Booking): number {
  if (b.service_kind !== "boarding") return 1;
  let cur = b.service_date;
  let n = 0;
  while (cur < b.service_end_date) {
    cur = addDays(cur, 1);
    n += 1;
  }
  return Math.max(1, n);
}

/**
 * Check out every dog a customer currently has on site in one tap. Marks each
 * checked-in booking checked out. Payment isn't required — anything still owed
 * surfaces in the kiosk "Unpaid" list, same as a single unpaid checkout.
 */
export async function kioskCheckOutGroup(formData: FormData) {
  const { userId } = await requireFullStaff();
  const customer_id = String(formData.get("customer_id") ?? "");
  if (!customer_id) redirect("/kiosk");

  const svc = createServiceClient();
  const { data: rows } = await svc
    .from("bookings")
    .select("id")
    .eq("customer_id", customer_id)
    .eq("status", "checked_in");
  const ids = ((rows ?? []) as { id: string }[]).map((b) => b.id);
  if (ids.length === 0) redirect("/kiosk");

  const now = new Date().toISOString();
  await svc
    .from("check_ins")
    .update({ checked_out_at: now, checked_out_by: userId })
    .in("booking_id", ids);
  await svc.from("bookings").update({ status: "checked_out" }).in("id", ids);

  revalidatePath("/kiosk");
  redirect("/kiosk?checkedout=1");
}

/**
 * Take a single combined payment for every on-site dog a customer still owes
 * for — each unpaid stay plus any unpaid add-ons — in one Stripe Checkout. The
 * session id is stamped on all of them so the webhook clears them together.
 */
export async function kioskPayGroup(formData: FormData) {
  await requireFullStaff();
  const customer_id = String(formData.get("customer_id") ?? "");
  if (!customer_id) redirect("/kiosk");
  const qr = isQrPay(formData);

  const svc = createServiceClient();
  const [{ data: profile }, { data: bookingRows }] = await Promise.all([
    svc
      .from("profiles")
      .select("email, full_name, account_credit_cents")
      .eq("id", customer_id)
      .maybeSingle<{
        email: string;
        full_name: string | null;
        account_credit_cents: number;
      }>(),
    svc
      .from("bookings")
      .select("*")
      .eq("customer_id", customer_id)
      .eq("status", "checked_in"),
  ]);
  const bookings = (bookingRows ?? []) as Booking[];
  if (bookings.length === 0) redirect("/kiosk");

  const dogIds = Array.from(new Set(bookings.map((b) => b.dog_id)));
  const { data: dogRows } = await svc.from("dogs").select("id, name").in("id", dogIds);
  const dogName = new Map(
    ((dogRows ?? []) as Pick<Dog, "id" | "name">[]).map((d) => [d.id, d.name]),
  );

  // Settle each unpaid stay against the customer's credit pool — its coupon OR
  // account credit (whichever's bigger, never both), exactly like the customer
  // portal. The displayed group total runs the same helper, so they agree.
  const unpaid = bookings
    .filter((b) => b.payment_status !== "paid")
    .sort((a, b) => a.service_date.localeCompare(b.service_date));
  const settlements = settleUnpaidBookings(
    unpaid,
    profile?.account_credit_cents ?? 0,
  );

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  const creditByBooking = new Map<string, number>();
  const freeSettlements: typeof settlements = [];

  for (const s of settlements) {
    const b = s.booking;
    const units = stayUnitsOf(b);
    const isBoarding = b.service_kind === "boarding";

    // Fully covered by coupon/credit — can't be a $0 Stripe line. Settle now.
    if (s.chargeAfter === 0 && s.discount > 0) {
      freeSettlements.push(s);
      continue;
    }

    // Stripe rejects unit_amount < 50¢; round up so a partial discount still
    // collects a token charge. Encode the discount into the per-unit amount.
    const adjustedUnit = Math.max(50, Math.ceil(s.chargeAfter / units));
    const effectiveDiscount =
      s.discount > 0 ? Math.max(0, s.total - adjustedUnit * units) : 0;
    const effectiveCredit = s.useCoupon ? 0 : effectiveDiscount;
    creditByBooking.set(b.id, effectiveCredit);

    const baseDesc = isBoarding
      ? `${units} night${units === 1 ? "" : "s"}: ${b.service_date} → ${b.service_end_date}`
      : `Service date: ${b.service_date}`;
    const description =
      effectiveDiscount > 0
        ? `${baseDesc} · $${(effectiveDiscount / 100).toFixed(2)} ${s.useCoupon ? "coupon" : "account credit"} applied`
        : baseDesc;
    lineItems.push({
      price_data: {
        currency: "usd" as const,
        product_data: {
          name: `${isBoarding ? "Boarding" : "Day care"} (${dogName.get(b.dog_id) ?? "Dog"})`,
          description,
        },
        unit_amount: adjustedUnit,
      },
      quantity: units,
    });
  }

  // Bookings fully covered by discounts: mark paid + burn their credit now (no
  // webhook fires for these), and send the confirmation/receipt the webhook
  // would otherwise have sent.
  if (freeSettlements.length > 0) {
    await svc
      .from("bookings")
      .update({
        payment_kind: "drop_in",
        payment_status: "paid",
        stripe_checkout_session_id: null,
      })
      .in("id", freeSettlements.map((s) => s.booking.id));
    const freeCredit = freeSettlements.reduce((sum, s) => sum + s.creditApplied, 0);
    if (freeCredit > 0) {
      const current = profile?.account_credit_cents ?? 0;
      await svc
        .from("profiles")
        .update({ account_credit_cents: Math.max(0, current - freeCredit) })
        .eq("id", customer_id);
    }
    if (profile?.email) {
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
        const dn = dogName.get(b.dog_id) ?? "Dog";
        await sendBookingConfirmation({
          to: profile.email,
          customerName: profile.full_name || profile.email,
          dogName: dn,
          dates,
          paidByPackageCount: 0,
          dropInCount: dates.length,
          dropInTotalCents: s.total,
        });
        await sendPaymentReceipt({
          to: profile.email,
          customerName: profile.full_name || profile.email,
          description: `${isBoarding ? "Boarding" : "Drop-in"} for ${dn} × ${dates.length} ${isBoarding ? "night" : "day"}${dates.length === 1 ? "" : "s"} (${s.useCoupon ? "coupon" : "account credit"})`,
          amountCents: s.total,
          paidAt: new Date(),
        });
      }
    }
  }

  // Unpaid add-ons across all the on-site dogs (incl. one stranded on a paid
  // stay) — billed at full price, no discount.
  const { data: washRows } = await svc
    .from("booking_addons")
    .select("*")
    .in("booking_id", bookings.map((b) => b.id))
    .eq("payment_status", "unpaid");
  const washes = (washRows ?? []) as BookingAddon[];
  for (const w of washes) {
    const dogId = bookings.find((b) => b.id === w.booking_id)?.dog_id;
    lineItems.push(dogWashLineItem(dogName.get(dogId ?? "") ?? "your dog"));
  }

  if (lineItems.length === 0) {
    redirect(
      freeSettlements.length > 0 ? "/kiosk?paid=1" : "/kiosk?error=Nothing+to+pay",
    );
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: profile?.email,
    line_items: lineItems,
    success_url: qr ? `${appUrl()}/pay-complete` : `${appUrl()}/kiosk?paid=1`,
    cancel_url: qr
      ? `${appUrl()}/pay-complete?canceled=1`
      : `${appUrl()}/kiosk?canceled=1`,
    metadata: { kind: "drop_in", customer_id, source: "kiosk-group" },
  });

  // Stamp the session + the credit each charged booking burns on success (the
  // webhook deducts sum(credit_applied_cents) for this session).
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
  if (washes.length > 0) {
    await svc
      .from("booking_addons")
      .update({ stripe_checkout_session_id: session.id })
      .in("id", washes.map((w) => w.id));
  }

  if (!session.url) redirect("/kiosk?error=Stripe+session+failed");
  redirect(qr ? qrPayPath(session.url) : session.url);
}

// ---------------------------------------------------------------------------
// Belongings checklist — the physical stuff (leash, bed, food bag, meds) that
// comes in with a dog. Logged at drop-off, ticked off as returned at pickup, so
// nothing goes home with the wrong dog or gets left behind.
// ---------------------------------------------------------------------------

const MAX_BELONGING_QTY = 99;

function clampQty(raw: unknown): number {
  const n = Number(raw ?? 1);
  return Number.isFinite(n)
    ? Math.min(MAX_BELONGING_QTY, Math.max(1, Math.floor(n)))
    : 1;
}

/**
 * Belongings mutations used by the client-side BelongingsManager. Unlike the
 * old form actions these DON'T redirect — they mutate, revalidate, and return
 * the fresh list, so the manager updates optimistically with no page reload.
 */

async function loadBelongingsBooking(
  svc: ReturnType<typeof createServiceClient>,
  bookingId: string,
) {
  const { data } = await svc
    .from("bookings")
    .select("id, dog_id, customer_id, status")
    .eq("id", bookingId)
    .maybeSingle<Pick<Booking, "id" | "dog_id" | "customer_id" | "status">>();
  return data;
}

/** Log one item dropped off with a dog. Returns the updated list. */
export async function liveAddBelonging(input: {
  bookingId: string;
  label: string;
  quantity?: number;
  notes?: string | null;
}): Promise<Belonging[]> {
  const { userId } = await requireFullStaff();
  const svc = createServiceClient();
  const label = (input.label ?? "").trim();
  if (!input.bookingId || !label) {
    return input.bookingId ? getBelongings(svc, input.bookingId) : [];
  }
  const booking = await loadBelongingsBooking(svc, input.bookingId);
  if (!booking || booking.status === "canceled") return [];

  const addQty = clampQty(input.quantity);
  // If an un-returned item with the same label is already logged, bump its
  // quantity instead of creating a duplicate row (re-adding "Leash" → ×3, not
  // two "Leash" entries). Match on trimmed, case-insensitive label.
  const current = await getBelongings(svc, booking.id);
  const match = current.find(
    (b) => !b.returned_at && b.label.trim().toLowerCase() === label.toLowerCase(),
  );
  if (match) {
    await svc
      .from("booking_belongings")
      .update({ quantity: Math.min(MAX_BELONGING_QTY, match.quantity + addQty) })
      .eq("id", match.id);
  } else {
    await addBelonging(svc, {
      bookingId: booking.id,
      dogId: booking.dog_id,
      customerId: booking.customer_id,
      label,
      quantity: addQty,
      notes: (input.notes ?? "").trim() || null,
      staffId: userId,
    });
  }
  revalidatePath(`/kiosk/booking/${booking.id}`);
  return getBelongings(svc, booking.id);
}

/** Prefill from the dog's most recent prior visit. Returns the updated list. */
export async function livePrefillBelongings(input: {
  bookingId: string;
}): Promise<Belonging[]> {
  const { userId } = await requireFullStaff();
  const svc = createServiceClient();
  if (!input.bookingId) return [];
  const booking = await loadBelongingsBooking(svc, input.bookingId);
  if (!booking || booking.status === "canceled") return [];

  const items = await lastStayBelongings(svc, {
    dogId: booking.dog_id,
    excludeBookingId: booking.id,
  });
  for (const item of items) {
    await addBelonging(svc, {
      bookingId: booking.id,
      dogId: booking.dog_id,
      customerId: booking.customer_id,
      label: item.label,
      quantity: item.quantity,
      staffId: userId,
    });
  }
  revalidatePath(`/kiosk/booking/${booking.id}`);
  return getBelongings(svc, booking.id);
}

export async function liveRemoveBelonging(input: {
  bookingId: string;
  id: string;
}): Promise<Belonging[]> {
  await requireFullStaff();
  const svc = createServiceClient();
  if (!input.id || !input.bookingId) {
    return input.bookingId ? getBelongings(svc, input.bookingId) : [];
  }
  await removeBelonging(svc, input.id);
  revalidatePath(`/kiosk/booking/${input.bookingId}`);
  return getBelongings(svc, input.bookingId);
}

/** Set the quantity on an existing item (the +/- stepper in the list). */
export async function liveSetBelongingQuantity(input: {
  bookingId: string;
  id: string;
  quantity: number;
}): Promise<Belonging[]> {
  await requireFullStaff();
  const svc = createServiceClient();
  if (!input.id || !input.bookingId) {
    return input.bookingId ? getBelongings(svc, input.bookingId) : [];
  }
  await svc
    .from("booking_belongings")
    .update({ quantity: clampQty(input.quantity) })
    .eq("id", input.id);
  revalidatePath(`/kiosk/booking/${input.bookingId}`);
  return getBelongings(svc, input.bookingId);
}

export async function liveSetBelongingReturned(input: {
  bookingId: string;
  id: string;
  returned: boolean;
}): Promise<Belonging[]> {
  const { userId } = await requireFullStaff();
  const svc = createServiceClient();
  if (!input.id || !input.bookingId) {
    return input.bookingId ? getBelongings(svc, input.bookingId) : [];
  }
  await setBelongingReturned(svc, {
    id: input.id,
    returned: input.returned,
    staffId: userId,
  });
  revalidatePath(`/kiosk/booking/${input.bookingId}`);
  return getBelongings(svc, input.bookingId);
}

export async function liveReturnAllBelongings(input: {
  bookingId: string;
}): Promise<Belonging[]> {
  const { userId } = await requireFullStaff();
  const svc = createServiceClient();
  if (!input.bookingId) return [];
  await returnAllBelongings(svc, { bookingId: input.bookingId, staffId: userId });
  revalidatePath(`/kiosk/booking/${input.bookingId}`);
  return getBelongings(svc, input.bookingId);
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { requireFullStaff } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { appUrl, getStripe } from "@/lib/stripe";
import { addDays, todayISO } from "@/lib/format";
import { sendBookingConfirmation, sendPackageLowAlert } from "@/lib/email";
import {
  BOARDING_STRIPE_PRICE_AMOUNT_CENTS,
  BOARDING_STRIPE_PRICE_ID,
  getBoardingRateCents,
} from "@/lib/settings";
import { isTimeInWindow } from "@/lib/hours";
import { createBookingCheckoutSession } from "@/lib/bookings.server";
import { addDogWash, dogWashLineItem } from "@/lib/addons.server";
import type {
  Booking,
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

  revalidatePath("/kiosk");
  redirect("/kiosk");
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

  // Paid packages with remaining days, FIFO.
  const { data: pkgRows } = await svc
    .from("customer_packages")
    .select("*")
    .eq("customer_id", customer_id)
    .eq("payment_status", "paid")
    .gt("days_remaining", 0)
    .order("created_at");
  const packages = (pkgRows ?? []) as CustomerPackage[];

  const allocations: { date: string; pkg: CustomerPackage | null }[] = [];
  let cursor = 0;
  for (const date of dates) {
    while (cursor < packages.length && packages[cursor].days_remaining <= 0) cursor++;
    if (cursor < packages.length) {
      allocations.push({ date, pkg: packages[cursor] });
      packages[cursor].days_remaining -= 1;
    } else {
      allocations.push({ date, pkg: null });
    }
  }

  const packageAllocs = allocations.filter((a) => a.pkg);
  const dropInAllocs = allocations.filter((a) => !a.pkg);

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

  // Insert package-funded bookings + decrement package balances.
  const confirmedPackageDates: string[] = [];
  const touchedPackageIds = new Set<string>();
  let firstPackageBookingId: string | null = null;
  for (const a of packageAllocs) {
    const pkg = a.pkg!;
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
        customer_package_id: pkg.id,
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
    touchedPackageIds.add(pkg.id);
    await svc
      .from("customer_packages")
      .update({ days_remaining: pkg.days_remaining })
      .eq("id", pkg.id);
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

  // Stripe checkout for drop-in days.
  const kioskDropInLineItem = dropInPriceId
    ? { price: dropInPriceId, quantity: dropInAllocs.length }
    : {
        price_data: {
          currency: "usd" as const,
          product_data: {
            name: `Day care drop-in (${dog!.name})`,
            description: `Service dates: ${dropInAllocs.map((a) => a.date).join(", ")}`,
          },
          unit_amount: dropInPriceCents!,
        },
        quantity: dropInAllocs.length,
      };
  const kioskLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    kioskDropInLineItem,
  ];
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
        unit_price_cents: dropInPriceCents,
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

/**
 * Take payment for an existing booking that's still unpaid.
 * Re-creates a Stripe Checkout session and redirects.
 */
export async function kioskTakePayment(formData: FormData) {
  await requireFullStaff();
  const booking_id = String(formData.get("booking_id") ?? "");
  if (!booking_id) redirect("/kiosk");

  const url = await createBookingCheckoutSession({
    bookingId: booking_id,
    successUrl: `${appUrl()}/kiosk?paid=1`,
    cancelUrl: `${appUrl()}/kiosk?canceled=1`,
    source: "kiosk",
  });
  if (!url) redirect("/kiosk?canceled=1");
  redirect(url);
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

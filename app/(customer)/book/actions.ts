"use server";

import { redirect } from "next/navigation";
import type Stripe from "stripe";
import { requireCustomer } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { appUrl, getStripe } from "@/lib/stripe";
import { sendBookingConfirmation, sendPackageLowAlert } from "@/lib/email";
import { addDays } from "@/lib/format";
import { getFullDates } from "@/lib/settings";
import { getPastDueUnpaid } from "@/lib/bookings.server";
import { getBlackoutDates } from "@/lib/blackouts.server";
import { isTimeInWindow } from "@/lib/hours";
import { VACCINE_LABEL } from "@/lib/vaccines";
import { assertDogReadyToBook } from "@/lib/vaccines.server";
import { addDogWash, dogWashLineItem } from "@/lib/addons.server";
import { sendStaffPush } from "@/lib/push.server";
import type { CustomerPackage, Dog, Package } from "@/lib/supabase/types";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function createBooking(formData: FormData) {
  const { userId, profile } = await requireCustomer();
  const dog_id = String(formData.get("dog_id") ?? "");
  const datesRaw = String(formData.get("service_dates") ?? "");
  const dates = Array.from(new Set(
    datesRaw.split(",").map((s) => s.trim()).filter((s) => ISO_RE.test(s))
  )).sort();
  const drop_off_time = String(formData.get("drop_off_time") ?? "");
  const pickup_time = String(formData.get("pickup_time") ?? "");
  const dogWash = String(formData.get("dog_wash") ?? "") === "1";

  if (!dog_id || dates.length === 0) {
    redirect("/book?error=Pick+a+dog+and+at+least+one+day");
  }
  if (
    !isTimeInWindow(drop_off_time) ||
    !isTimeInWindow(pickup_time) ||
    pickup_time <= drop_off_time
  ) {
    redirect(
      "/book?error=Pick+a+drop-off+and+pickup+between+6+AM+and+6+PM",
    );
  }

  const pastDue = await getPastDueUnpaid(userId);
  if (pastDue.length > 0) {
    redirect(
      "/book?error=" +
        encodeURIComponent("Please pay your past balance before booking again."),
    );
  }

  const supabase = await createClient();

  // Sanity check ownership of dog.
  const { data: dog } = await supabase
    .from("dogs")
    .select("*")
    .eq("id", dog_id)
    .eq("owner_id", userId)
    .maybeSingle<Dog>();
  if (!dog) redirect("/book?error=Dog+not+found");

  // Vaccine gate: require verified, non-expired records covering the last
  // service day. The client form already blocks, but a malicious / stale
  // request must still be rejected here.
  const lastDate = dates[dates.length - 1];
  const vax = await assertDogReadyToBook(dog_id, lastDate);
  if (!vax.ok) {
    const missing = vax.missing.map((k) => VACCINE_LABEL[k]).join(", ");
    redirect(
      `/book?error=${encodeURIComponent(
        `Upload these vaccine records first: ${missing}`,
      )}`,
    );
  }

  // Capacity check: block any requested date that's already at the daily cap.
  const full = await getFullDates(dates);
  const fullRequested = dates.filter((d) => full.has(d));
  if (fullRequested.length > 0) {
    const list = fullRequested.join(", ");
    redirect(
      `/book?error=${encodeURIComponent(`These days are full, please pick another: ${list}`)}`,
    );
  }

  // Blackout check: refuse any blacked-out day for daycare.
  const blackouts = await getBlackoutDates(
    dates[0],
    dates[dates.length - 1],
    "daycare",
  );
  const blocked = dates.filter((d) => blackouts.has(d));
  if (blocked.length > 0) {
    redirect(
      `/book?error=${encodeURIComponent(`We're closed on these days: ${blocked.join(", ")}`)}`,
    );
  }

  // Pull paid packages with remaining days, oldest first (FIFO).
  const { data: pkgRows } = await supabase
    .from("customer_packages")
    .select("*")
    .eq("customer_id", userId)
    .eq("payment_status", "paid")
    .gt("days_remaining", 0)
    .order("created_at");
  const packages = (pkgRows ?? []) as CustomerPackage[];

  // Allocate package days first.
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

  // Look up the 1-day "drop in" package price.
  let dropInPriceCents: number | null = null;
  let dropInPriceId: string | null = null;
  if (dropInAllocs.length > 0) {
    const { data: dropInPkg } = await supabase
      .from("packages")
      .select("*")
      .eq("active", true)
      .eq("days_included", 1)
      .order("price_cents")
      .limit(1)
      .maybeSingle<Package>();
    if (!dropInPkg) {
      redirect("/book?error=No+drop-in+rate+configured");
    }
    dropInPriceCents = dropInPkg!.price_cents;
    dropInPriceId = dropInPkg!.stripe_price_id;
  }

  // Use service client to decrement package days + insert bookings transactionally-ish.
  // (Two RPCs would be cleaner but service client lets us bypass RLS for the package update.)
  const svc = createServiceClient();

  // Insert package-funded bookings + decrement package balances.
  const confirmedPackageDates: string[] = [];
  const touchedPackageIds = new Set<string>();
  let firstPackageBookingId: string | null = null;
  for (const a of packageAllocs) {
    const pkg = a.pkg!;
    const { data: inserted, error: insErr } = await svc
      .from("bookings")
      .insert({
        customer_id: userId,
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
      // If a uniqueness violation (already booked that day) — skip silently.
      if (!insErr.message.toLowerCase().includes("duplicate")) {
        redirect(`/book?error=${encodeURIComponent(insErr.message)}`);
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

  // Let staff know a customer just booked day care.
  await sendStaffPush({
    title: "New day care booking",
    body: `${profile.full_name ?? profile.email} booked ${dog.name} for ${dates.length} day${dates.length === 1 ? "" : "s"}`,
    data: { type: "booking", customerId: userId, dogId: dog_id },
  });

  // If no drop-in days, the booking is fully confirmed now — send the email.
  if (dropInAllocs.length === 0) {
    if (confirmedPackageDates.length > 0) {
      await sendBookingConfirmation({
        to: profile.email,
        customerName: profile.full_name ?? profile.email,
        dogName: dog.name,
        dates: confirmedPackageDates,
        paidByPackageCount: confirmedPackageDates.length,
        dropInCount: 0,
        dropInTotalCents: 0,
      });
    }
    await maybeSendPackageLowAlerts(svc, userId, profile.email, profile.full_name, touchedPackageIds);

    // Days are all package-covered, but a wash still needs paying — send the
    // customer to a wash-only checkout. The webhook flips the add-on to paid.
    if (dogWash && firstPackageBookingId) {
      const stripe = getStripe();
      const washSession = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: profile.email,
        line_items: [dogWashLineItem(dog.name)],
        success_url: `${appUrl()}/book?status=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl()}/book?error=Checkout+canceled`,
        metadata: { kind: "addon", customer_id: userId, dog_id },
      });
      await addDogWash(svc, {
        bookingId: firstPackageBookingId,
        customerId: userId,
        sessionId: washSession.id,
      });
      if (!washSession.url) redirect("/book?error=Stripe+session+failed");
      redirect(washSession.url);
    }
    redirect("/book?status=package_redeemed");
  }

  // Mixed booking: confirm the package-funded portion now; drop-in confirmation
  // will be sent by the webhook once Stripe confirms payment.
  if (confirmedPackageDates.length > 0) {
    await sendBookingConfirmation({
      to: profile.email,
      customerName: profile.full_name ?? profile.email,
      dogName: dog.name,
      dates: confirmedPackageDates,
      paidByPackageCount: confirmedPackageDates.length,
      dropInCount: 0,
      dropInTotalCents: 0,
    });
  }
  await maybeSendPackageLowAlerts(svc, userId, profile.email, profile.full_name, touchedPackageIds);

  // Otherwise: create Stripe checkout for the drop-in days, with a "pending" booking row each.
  const stripe = getStripe();
  const dropInLineItem = dropInPriceId
    ? { price: dropInPriceId, quantity: dropInAllocs.length }
    : {
        price_data: {
          currency: "usd" as const,
          product_data: {
            name: `Day care drop-in (${dog.name})`,
            description: `Service dates: ${dropInAllocs.map((a) => a.date).join(", ")}`,
          },
          unit_amount: dropInPriceCents!,
        },
        quantity: dropInAllocs.length,
      };
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    dropInLineItem,
  ];
  if (dogWash) lineItems.push(dogWashLineItem(dog.name));
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: profile.email,
    line_items: lineItems,
    success_url: `${appUrl()}/book?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/book?error=Checkout+canceled`,
    metadata: {
      kind: "drop_in",
      customer_id: userId,
      dog_id,
      service_dates: dropInAllocs.map((a) => a.date).join(","),
    },
  });

  // Pre-create bookings as unpaid, linked to the session id, so the webhook flips them.
  let firstDropInBookingId: string | null = null;
  for (const a of dropInAllocs) {
    const { data: inserted } = await svc
      .from("bookings")
      .insert({
        customer_id: userId,
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

  // One wash per stay, riding on the same checkout as the drop-in days.
  if (dogWash && firstDropInBookingId) {
    await addDogWash(svc, {
      bookingId: firstDropInBookingId,
      customerId: userId,
      sessionId: session.id,
    });
  }

  if (!session.url) redirect("/book?error=Stripe+session+failed");
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

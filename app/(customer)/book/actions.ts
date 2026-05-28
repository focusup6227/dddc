"use server";

import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { appUrl, getStripe } from "@/lib/stripe";
import { sendBookingConfirmation, sendPackageLowAlert } from "@/lib/email";
import { addDays } from "@/lib/format";
import { getFullDates } from "@/lib/settings";
import { VACCINE_LABEL } from "@/lib/vaccines";
import { assertDogReadyToBook } from "@/lib/vaccines.server";
import type { CustomerPackage, Dog, Package } from "@/lib/supabase/types";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function createBooking(formData: FormData) {
  const { userId, profile } = await requireCustomer();
  const dog_id = String(formData.get("dog_id") ?? "");
  const datesRaw = String(formData.get("service_dates") ?? "");
  const dates = Array.from(new Set(
    datesRaw.split(",").map((s) => s.trim()).filter((s) => ISO_RE.test(s))
  )).sort();

  if (!dog_id || dates.length === 0) {
    redirect("/book?error=Pick+a+dog+and+at+least+one+day");
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
  for (const a of packageAllocs) {
    const pkg = a.pkg!;
    const { error: insErr } = await svc.from("bookings").insert({
      customer_id: userId,
      dog_id,
      service_date: a.date,
      service_end_date: addDays(a.date, 1),
      status: "reserved",
      payment_kind: "package",
      customer_package_id: pkg.id,
      payment_status: "paid",
    });
    if (insErr) {
      // If a uniqueness violation (already booked that day) — skip silently.
      if (!insErr.message.toLowerCase().includes("duplicate")) {
        redirect(`/book?error=${encodeURIComponent(insErr.message)}`);
      }
      continue;
    }
    confirmedPackageDates.push(a.date);
    touchedPackageIds.add(pkg.id);
    await svc
      .from("customer_packages")
      .update({ days_remaining: pkg.days_remaining })
      .eq("id", pkg.id);
  }

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
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: profile.email,
    line_items: [dropInLineItem],
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
  for (const a of dropInAllocs) {
    await svc.from("bookings").insert({
      customer_id: userId,
      dog_id,
      service_date: a.date,
      service_end_date: addDays(a.date, 1),
      status: "reserved",
      payment_kind: "drop_in",
      unit_price_cents: dropInPriceCents,
      stripe_checkout_session_id: session.id,
      payment_status: "unpaid",
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

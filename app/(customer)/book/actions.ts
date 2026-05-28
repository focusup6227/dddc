"use server";

import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { appUrl, getStripe } from "@/lib/stripe";
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
  }

  // Use service client to decrement package days + insert bookings transactionally-ish.
  // (Two RPCs would be cleaner but service client lets us bypass RLS for the package update.)
  const svc = createServiceClient();

  // Insert package-funded bookings + decrement package balances.
  for (const a of packageAllocs) {
    const pkg = a.pkg!;
    const { error: insErr } = await svc.from("bookings").insert({
      customer_id: userId,
      dog_id,
      service_date: a.date,
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
    await svc
      .from("customer_packages")
      .update({ days_remaining: pkg.days_remaining })
      .eq("id", pkg.id);
  }

  // If no drop-in days, we're done.
  if (dropInAllocs.length === 0) {
    redirect("/book?status=package_redeemed");
  }

  // Otherwise: create Stripe checkout for the drop-in days, with a "pending" booking row each.
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: profile.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Day care drop-in (${dog.name})`,
            description: `Service dates: ${dropInAllocs.map((a) => a.date).join(", ")}`,
          },
          unit_amount: dropInPriceCents!,
        },
        quantity: dropInAllocs.length,
      },
    ],
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
      status: "reserved",
      payment_kind: "drop_in",
      drop_in_price_cents: dropInPriceCents,
      stripe_checkout_session_id: session.id,
      payment_status: "unpaid",
    });
  }

  if (!session.url) redirect("/book?error=Stripe+session+failed");
  redirect(session.url);
}

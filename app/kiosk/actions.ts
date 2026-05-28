"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { appUrl, getStripe } from "@/lib/stripe";
import { todayISO } from "@/lib/format";
import type { Booking, CheckIn, Dog, Package, Profile } from "@/lib/supabase/types";

export async function kioskCheckIn(formData: FormData) {
  const { userId } = await requireStaff();
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
  const { userId } = await requireStaff();
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
  await requireStaff();
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
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: profile!.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Day care drop-in (${dog!.name})`,
            description: `Walk-in · ${today}`,
          },
          unit_amount: dropInPkg!.price_cents,
        },
        quantity: 1,
      },
    ],
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
        drop_in_price_cents: dropInPkg!.price_cents,
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
      status: "reserved",
      payment_kind: "drop_in",
      drop_in_price_cents: dropInPkg!.price_cents,
      stripe_checkout_session_id: session.id,
      payment_status: "unpaid",
    });
  }

  if (!session.url) redirect("/kiosk/walk-in?error=Stripe+session+failed");
  redirect(session.url);
}

/**
 * Take payment for an existing booking that's still unpaid.
 * Re-creates a Stripe Checkout session and redirects.
 */
export async function kioskTakePayment(formData: FormData) {
  await requireStaff();
  const booking_id = String(formData.get("booking_id") ?? "");
  if (!booking_id) redirect("/kiosk");

  const svc = createServiceClient();
  const { data: booking } = await svc
    .from("bookings")
    .select("*")
    .eq("id", booking_id)
    .maybeSingle<Booking>();
  if (!booking) redirect("/kiosk");

  const [{ data: dog }, { data: cust }, { data: dropInPkg }] = await Promise.all([
    svc.from("dogs").select("*").eq("id", booking!.dog_id).maybeSingle<Dog>(),
    svc.from("profiles").select("*").eq("id", booking!.customer_id).maybeSingle<Profile>(),
    svc
      .from("packages")
      .select("*")
      .eq("active", true)
      .eq("days_included", 1)
      .order("price_cents")
      .limit(1)
      .maybeSingle<Package>(),
  ]);
  if (!dog || !cust || !dropInPkg) redirect("/kiosk");

  const priceCents = booking!.drop_in_price_cents ?? dropInPkg!.price_cents;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: cust!.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Day care drop-in (${dog!.name})`,
            description: `Service date: ${booking!.service_date}`,
          },
          unit_amount: priceCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl()}/kiosk?paid=1`,
    cancel_url: `${appUrl()}/kiosk?canceled=1`,
    metadata: {
      kind: "drop_in",
      customer_id: cust!.id,
      dog_id: dog!.id,
      service_dates: booking!.service_date,
      source: "kiosk",
    },
  });

  await svc
    .from("bookings")
    .update({
      payment_kind: "drop_in",
      drop_in_price_cents: priceCents,
      stripe_checkout_session_id: session.id,
      payment_status: "unpaid",
    })
    .eq("id", booking_id);

  if (!session.url) redirect("/kiosk?canceled=1");
  redirect(session.url);
}

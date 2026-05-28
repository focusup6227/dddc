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
import { appUrl, getStripe } from "@/lib/stripe";
import type { Booking, Dog } from "@/lib/supabase/types";

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

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = unpaid.map(
    (b) => {
      const isBoarding = b.service_kind === "boarding";
      const nights = isBoarding
        ? Math.max(1, countNights(b.service_date, b.service_end_date))
        : 1;
      const unit = b.unit_price_cents ?? 0;
      return {
        price_data: {
          currency: "usd" as const,
          product_data: {
            name: isBoarding
              ? `Boarding (${dogName.get(b.dog_id) ?? "Dog"})`
              : `Day care (${dogName.get(b.dog_id) ?? "Dog"})`,
            description: isBoarding
              ? `${nights} night${nights === 1 ? "" : "s"}: ${b.service_date} → ${b.service_end_date}`
              : `Service date: ${b.service_date}`,
          },
          unit_amount: unit,
        },
        quantity: nights,
      };
    },
  );

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
      booking_count: String(unpaid.length),
    },
  });

  await svc
    .from("bookings")
    .update({
      payment_kind: "drop_in",
      stripe_checkout_session_id: session.id,
    })
    .in(
      "id",
      unpaid.map((b) => b.id),
    );

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

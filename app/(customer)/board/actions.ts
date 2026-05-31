"use server";

import { redirect } from "next/navigation";
import type Stripe from "stripe";
import { requireCustomer } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { appUrl, getStripe } from "@/lib/stripe";
import { addDays } from "@/lib/format";
import {
  BOARDING_STRIPE_PRICE_AMOUNT_CENTS,
  BOARDING_STRIPE_PRICE_ID,
  getBoardingRateCents,
  getFullDates,
} from "@/lib/settings";
import { isTimeInWindow } from "@/lib/hours";
import { getPastDueUnpaid } from "@/lib/bookings.server";
import { getBlackoutDates } from "@/lib/blackouts.server";
import { VACCINE_LABEL } from "@/lib/vaccines";
import { assertDogReadyToBook } from "@/lib/vaccines.server";
import { addDogWash, dogWashLineItem } from "@/lib/addons.server";
import type { Dog } from "@/lib/supabase/types";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NIGHTS = 30;

export async function createBoarding(formData: FormData) {
  const { userId, profile } = await requireCustomer();
  const dog_id = String(formData.get("dog_id") ?? "");
  const checkIn = String(formData.get("check_in") ?? "");
  const checkOut = String(formData.get("check_out") ?? "");
  const drop_off_time = String(formData.get("drop_off_time") ?? "");
  const pickup_time = String(formData.get("pickup_time") ?? "");
  const dogWash = String(formData.get("dog_wash") ?? "") === "1";

  if (!dog_id || !ISO_RE.test(checkIn) || !ISO_RE.test(checkOut)) {
    redirect("/board?error=Pick+a+dog+and+valid+dates");
  }
  if (checkOut <= checkIn) {
    redirect("/board?error=Check-out+must+be+after+check-in");
  }
  if (!isTimeInWindow(drop_off_time) || !isTimeInWindow(pickup_time)) {
    redirect(
      "/board?error=Pick+a+drop-off+and+pickup+between+6+AM+and+6+PM",
    );
  }

  const pastDue = await getPastDueUnpaid(userId);
  if (pastDue.length > 0) {
    redirect(
      "/board?error=" +
        encodeURIComponent("Please pay your past balance before booking again."),
    );
  }

  const nights: string[] = [];
  let cur = checkIn;
  while (cur < checkOut && nights.length < MAX_NIGHTS) {
    nights.push(cur);
    cur = addDays(cur, 1);
  }
  if (nights.length === 0) {
    redirect("/board?error=Pick+at+least+one+night");
  }

  const supabase = await createClient();
  const { data: dog } = await supabase
    .from("dogs")
    .select("*")
    .eq("id", dog_id)
    .eq("owner_id", userId)
    .maybeSingle<Dog>();
  if (!dog) redirect("/board?error=Dog+not+found");

  // Vaccines must be verified + non-expired through the last night of the stay.
  const lastNight = nights[nights.length - 1];
  const vax = await assertDogReadyToBook(dog_id, lastNight);
  if (!vax.ok) {
    const missing = vax.missing.map((k) => VACCINE_LABEL[k]).join(", ");
    redirect(
      `/board?error=${encodeURIComponent(
        `Upload these vaccine records first: ${missing}`,
      )}`,
    );
  }

  // Capacity check against boarding pool.
  const fullNights = await getFullDates(nights, "boarding");
  const overlapping = nights.filter((n) => fullNights.has(n));
  if (overlapping.length > 0) {
    redirect(
      `/board?error=${encodeURIComponent(`These nights are full: ${overlapping.join(", ")}`)}`,
    );
  }

  // Blackout check.
  const blackouts = await getBlackoutDates(
    nights[0],
    nights[nights.length - 1],
    "boarding",
  );
  const closed = nights.filter((n) => blackouts.has(n));
  if (closed.length > 0) {
    redirect(
      `/board?error=${encodeURIComponent(`We're closed on these nights: ${closed.join(", ")}`)}`,
    );
  }

  const rateCents = await getBoardingRateCents();

  const svc = createServiceClient();

  // If the saved boarding rate still matches the Stripe price's unit_amount,
  // reference the pre-made Stripe price (clean reporting). Otherwise fall back
  // to ad-hoc price_data so the customer is charged the current rate.
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

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [lineItem];
  if (dogWash) lineItems.push(dogWashLineItem(dog!.name));
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: profile.email,
    line_items: lineItems,
    success_url: `${appUrl()}/board?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/board?error=Checkout+canceled`,
    metadata: {
      kind: "boarding",
      customer_id: userId,
      dog_id,
      service_dates: nights.join(","),
    },
  });

  // One booking row covers the full stay: service_date = check-in, service_end_date = check-out.
  const { data: stay } = await svc
    .from("bookings")
    .insert({
      customer_id: userId,
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
      customerId: userId,
      sessionId: session.id,
    });
  }

  if (!session.url) redirect("/board?error=Stripe+session+failed");
  redirect(session.url);
}

import "server-only";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { DOG_WASH_PRICE_CENTS } from "@/lib/settings";
import type { BookingAddon } from "@/lib/supabase/types";

export const DOG_WASH_KIND = "dog_wash";

type Svc = ReturnType<typeof createServiceClient>;

/** A Stripe line item for one dog wash, billed at the current flat rate. */
export function dogWashLineItem(
  dogName: string,
): Stripe.Checkout.SessionCreateParams.LineItem {
  return {
    price_data: {
      currency: "usd" as const,
      product_data: { name: `Dog wash (${dogName})` },
      unit_amount: DOG_WASH_PRICE_CENTS,
    },
    quantity: 1,
  };
}

/**
 * Record a dog-wash add-on for a booking. `sessionId` ties it to the Stripe
 * Checkout that will collect payment; the webhook flips it to paid by that id.
 * Pass `paid: true` only when the wash was settled outside Stripe.
 */
export async function addDogWash(
  svc: Svc,
  args: {
    bookingId: string;
    customerId: string;
    sessionId: string | null;
    paid?: boolean;
  },
) {
  await svc.from("booking_addons").insert({
    booking_id: args.bookingId,
    customer_id: args.customerId,
    kind: DOG_WASH_KIND,
    amount_cents: DOG_WASH_PRICE_CENTS,
    payment_status: args.paid ? "paid" : "unpaid",
    stripe_checkout_session_id: args.sessionId,
  });
}

/** Unpaid add-ons riding on any of the given bookings. */
export async function getUnpaidAddonsForBookings(
  svc: Svc,
  bookingIds: string[],
): Promise<BookingAddon[]> {
  if (bookingIds.length === 0) return [];
  const { data } = await svc
    .from("booking_addons")
    .select("*")
    .in("booking_id", bookingIds)
    .eq("payment_status", "unpaid");
  return (data ?? []) as BookingAddon[];
}

/** Every unpaid add-on for a customer, across all their bookings. */
export async function getUnpaidAddonsForCustomer(
  svc: Svc,
  customerId: string,
): Promise<BookingAddon[]> {
  const { data } = await svc
    .from("booking_addons")
    .select("*")
    .eq("customer_id", customerId)
    .eq("payment_status", "unpaid");
  return (data ?? []) as BookingAddon[];
}

/** Point a set of add-ons at the checkout session that will pay for them. */
export async function stampAddonSession(
  svc: Svc,
  addonIds: string[],
  sessionId: string,
) {
  if (addonIds.length === 0) return;
  await svc
    .from("booking_addons")
    .update({ stripe_checkout_session_id: sessionId })
    .in("id", addonIds);
}

/**
 * Flip every unpaid add-on attached to a completed checkout session to paid.
 * Returns the total amount and count so the webhook can fold them into (or
 * send) a receipt. Safe to call for any session — returns zeros when none match.
 */
export async function markAddonsPaidBySession(
  svc: Svc,
  sessionId: string,
  paymentIntentId: string | null,
): Promise<{ totalCents: number; count: number }> {
  const { data } = await svc
    .from("booking_addons")
    .update({
      payment_status: "paid",
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq("stripe_checkout_session_id", sessionId)
    .eq("payment_status", "unpaid")
    .select("amount_cents");
  const rows = (data ?? []) as { amount_cents: number }[];
  return {
    totalCents: rows.reduce((s, r) => s + r.amount_cents, 0),
    count: rows.length,
  };
}

/** Mark a failed session's add-ons failed so they don't linger as unpaid. */
export async function markAddonsFailedBySession(svc: Svc, sessionId: string) {
  await svc
    .from("booking_addons")
    .update({ payment_status: "failed" })
    .eq("stripe_checkout_session_id", sessionId)
    .eq("payment_status", "unpaid");
}

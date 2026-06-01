import "server-only";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { settleUnpaidBookings } from "@/lib/coupons.server";
import { sendBookingConfirmation, sendPaymentReceipt } from "@/lib/email";
import { addDays } from "@/lib/format";
import type { Booking, BookingAddon, Dog } from "@/lib/supabase/types";

export type TerminalPaymentResult =
  | { status: "charge"; clientSecret: string; paymentIntentId: string; amountCents: number }
  | { status: "covered"; amountCents: 0 }
  | { status: "empty" };

/**
 * Build an in-person (Tap to Pay / card_present) PaymentIntent for a set of
 * unpaid bookings belonging to ONE customer. Reuses the same settlement the
 * web kiosk charges with — coupon OR account credit, never both — so a tapped
 * payment costs exactly what the hosted checkout would.
 *
 * Stays fully covered by discount are settled here (marked paid, credit burned,
 * receipt sent); the remaining amount becomes the PaymentIntent. Charged
 * bookings + their unpaid add-ons are stamped with the PI id so the webhook's
 * `payment_intent.succeeded` branch flips them paid once the tap clears.
 */
export async function createTerminalPaymentForBookings(
  bookingIds: string[],
): Promise<TerminalPaymentResult> {
  const svc = createServiceClient();
  const { data: bookingRows } = await svc
    .from("bookings")
    .select("*")
    .in("id", bookingIds)
    .eq("payment_status", "unpaid")
    .neq("status", "canceled");
  const bookings = (bookingRows ?? []) as Booking[];
  if (bookings.length === 0) return { status: "empty" };

  // All bookings must belong to a single customer (one tap = one payer).
  const customerId = bookings[0].customer_id;
  const sameCustomer = bookings.filter((b) => b.customer_id === customerId);

  const { data: profile } = await svc
    .from("profiles")
    .select("email, full_name, account_credit_cents")
    .eq("id", customerId)
    .maybeSingle<{
      email: string;
      full_name: string | null;
      account_credit_cents: number;
    }>();

  const dogIds = Array.from(new Set(sameCustomer.map((b) => b.dog_id)));
  const { data: dogRows } = await svc.from("dogs").select("id, name").in("id", dogIds);
  const dogName = new Map(
    ((dogRows ?? []) as Pick<Dog, "id" | "name">[]).map((d) => [d.id, d.name]),
  );

  const sorted = [...sameCustomer].sort((a, b) =>
    a.service_date.localeCompare(b.service_date),
  );
  const settlements = settleUnpaidBookings(
    sorted,
    profile?.account_credit_cents ?? 0,
  );

  let amount = 0;
  const chargedIds: string[] = [];
  const creditByBooking = new Map<string, number>();
  const freeSettlements: typeof settlements = [];
  for (const s of settlements) {
    if (s.chargeAfter === 0 && s.discount > 0) {
      freeSettlements.push(s);
      continue;
    }
    amount += s.chargeAfter;
    chargedIds.push(s.booking.id);
    creditByBooking.set(s.booking.id, s.creditApplied);
  }

  // Settle fully-covered stays now (no tap needed for these).
  if (freeSettlements.length > 0) {
    await svc
      .from("bookings")
      .update({ payment_kind: "drop_in", payment_status: "paid" })
      .in("id", freeSettlements.map((s) => s.booking.id));
    const freeCredit = freeSettlements.reduce((sum, s) => sum + s.creditApplied, 0);
    if (freeCredit > 0) {
      const current = profile?.account_credit_cents ?? 0;
      await svc
        .from("profiles")
        .update({ account_credit_cents: Math.max(0, current - freeCredit) })
        .eq("id", customerId);
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

  // Unpaid add-ons across these bookings — billed at full price.
  const { data: washRows } = await svc
    .from("booking_addons")
    .select("*")
    .in("booking_id", sameCustomer.map((b) => b.id))
    .eq("payment_status", "unpaid");
  const washes = (washRows ?? []) as BookingAddon[];
  const washTotal = washes.reduce((s, w) => s + w.amount_cents, 0);
  amount += washTotal;

  if (amount === 0) {
    // Everything was covered by discounts; nothing left to tap for.
    return freeSettlements.length > 0
      ? { status: "covered", amountCents: 0 }
      : { status: "empty" };
  }

  // Stripe rejects charges under 50¢.
  const chargeAmount = Math.max(50, amount);

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.create({
    amount: chargeAmount,
    currency: "usd",
    payment_method_types: ["card_present"],
    capture_method: "automatic",
    metadata: {
      kind: "terminal",
      customer_id: customerId,
      booking_ids: chargedIds.join(","),
      source: "kiosk-tap",
    },
  });

  // Stamp the PI on the charged bookings (+ the credit each will burn) and on
  // the unpaid add-ons, so the webhook can flip them all by PI id.
  for (const id of chargedIds) {
    await svc
      .from("bookings")
      .update({
        payment_kind: "drop_in",
        stripe_payment_intent_id: intent.id,
        credit_applied_cents: creditByBooking.get(id) ?? 0,
      })
      .eq("id", id);
  }
  if (washes.length > 0) {
    await svc
      .from("booking_addons")
      .update({ stripe_payment_intent_id: intent.id })
      .in("id", washes.map((w) => w.id));
  }

  return {
    status: "charge",
    clientSecret: intent.client_secret ?? "",
    paymentIntentId: intent.id,
    amountCents: chargeAmount,
  };
}

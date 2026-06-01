import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { sendBookingConfirmation, sendPaymentReceipt } from "@/lib/email";
import {
  markAddonsFailedBySession,
  markAddonsPaidBySession,
} from "@/lib/addons.server";
import { sendStaffPush } from "@/lib/push.server";
import { addDays } from "@/lib/format";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// Stripe sends raw bodies; opt out of body parsing.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });
  }

  const body = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const svc = createServiceClient();

  // Idempotency: skip if we've already processed this event.
  const { data: existing } = await svc
    .from("stripe_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();
  if (existing) return NextResponse.json({ received: true, deduped: true });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSucceeded(svc, session);
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutFailed(svc, session);
        break;
      }
      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        // Only in-person (Tap to Pay) intents are settled here; intents created
        // by a Checkout Session are already handled by the session events above.
        if (intent.metadata?.kind === "terminal") {
          await handleTerminalSucceeded(svc, intent);
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        if (intent.metadata?.kind === "terminal") {
          await handleTerminalFailed(svc, intent);
        }
        break;
      }
      default:
        // ignore
        break;
    }

    await svc.from("stripe_events").insert({
      id: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });
  } catch (err) {
    // Log to stripe_events for debugging, but return 500 so Stripe retries.
    console.error("Stripe webhook error", err);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

type Svc = ReturnType<typeof createServiceClient>;

async function handleCheckoutSucceeded(
  svc: Svc,
  session: Stripe.Checkout.Session,
) {
  const kind = session.metadata?.kind;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  // Flip any dog-wash add-ons paid by this session, regardless of kind. For
  // booking+wash checkouts the wash total is folded into the receipt below;
  // for wash-only checkouts (kind "addon") we send a standalone receipt.
  const wash = await markAddonsPaidBySession(svc, session.id, paymentIntentId);

  if (kind === "addon") {
    if (wash.totalCents > 0) {
      const customerId = session.metadata?.customer_id;
      const dogId = session.metadata?.dog_id;
      const [{ data: profile }, { data: dog }] = await Promise.all([
        svc.from("profiles").select("email, full_name").eq("id", customerId).maybeSingle(),
        svc.from("dogs").select("name").eq("id", dogId).maybeSingle(),
      ]);
      if (profile?.email) {
        await sendPaymentReceipt({
          to: profile.email,
          customerName: profile.full_name ?? profile.email,
          description: `Dog wash for ${dog?.name ?? "your dog"}`,
          amountCents: wash.totalCents || session.amount_total || 0,
          paidAt: new Date(),
        });
      }
    }
    return;
  }

  if (kind === "package") {
    const { data: pkgRows } = await svc
      .from("customer_packages")
      .update({
        payment_status: "paid",
        stripe_payment_intent_id: paymentIntentId,
      })
      .eq("stripe_checkout_session_id", session.id)
      .select("id, customer_id, package_id, amount_paid_cents");
    const pkg = pkgRows?.[0];
    if (pkg) {
      const [{ data: profile }, { data: catalog }] = await Promise.all([
        svc.from("profiles").select("email, full_name").eq("id", pkg.customer_id).maybeSingle(),
        svc.from("packages").select("name").eq("id", pkg.package_id).maybeSingle(),
      ]);
      if (profile?.email) {
        await sendPaymentReceipt({
          to: profile.email,
          customerName: profile.full_name ?? profile.email,
          description: catalog?.name ?? "Day care package",
          amountCents: pkg.amount_paid_cents ?? session.amount_total ?? 0,
          paidAt: new Date(),
        });
      }
    }
    return;
  }

  if (kind === "drop_in" || kind === "boarding") {
    const { data: bookingRows } = await svc
      .from("bookings")
      .update({
        payment_status: "paid",
        stripe_payment_intent_id: paymentIntentId,
      })
      .eq("stripe_checkout_session_id", session.id)
      .select(
        "id, customer_id, dog_id, service_date, service_end_date, unit_price_cents, credit_applied_cents",
      );
    const bookings = bookingRows ?? [];
    if (bookings.length === 0) return;

    // Burn down account credit for whatever this session applied. Floor at
    // zero so concurrent sessions can't drive the balance negative.
    const customerCreditUsed = bookings.reduce(
      (sum, b) => sum + (b.credit_applied_cents ?? 0),
      0,
    );
    if (customerCreditUsed > 0) {
      await deductAccountCredit(svc, bookings[0].customer_id, customerCreditUsed);
    }

    // First paid booking flips a pending referral into credited and gives
    // both parties their $10.
    await creditReferralIfFirstPaid(svc, bookings[0].customer_id);

    const customerId = bookings[0].customer_id;
    const dogId = bookings[0].dog_id;
    const [{ data: profile }, { data: dog }] = await Promise.all([
      svc.from("profiles").select("email, full_name").eq("id", customerId).maybeSingle(),
      svc.from("dogs").select("name").eq("id", dogId).maybeSingle(),
    ]);
    if (!profile?.email || !dog) return;

    // Expand each booking into the dates it covers. Daycare bookings span one
    // day; boarding bookings span multiple nights as a single row.
    const dates: string[] = [];
    let totalCents = 0;
    let unitCount = 0;
    for (const b of bookings) {
      let cur = b.service_date;
      while (cur < b.service_end_date) {
        dates.push(cur);
        unitCount += 1;
        totalCents += b.unit_price_cents ?? 0;
        cur = addDays(cur, 1);
      }
    }
    dates.sort();

    const isBoarding = kind === "boarding";
    const unit = isBoarding ? "night" : "day";

    await sendBookingConfirmation({
      to: profile.email,
      customerName: profile.full_name ?? profile.email,
      dogName: dog.name,
      dates,
      paidByPackageCount: 0,
      dropInCount: unitCount,
      dropInTotalCents: totalCents,
    });
    await sendPaymentReceipt({
      to: profile.email,
      customerName: profile.full_name ?? profile.email,
      description: `${isBoarding ? "Boarding" : "Drop-in"} for ${dog.name} × ${unitCount} ${unit}${unitCount === 1 ? "" : "s"}${wash.count > 0 ? " + dog wash" : ""}`,
      amountCents: totalCents + wash.totalCents || session.amount_total || 0,
      paidAt: new Date(),
    });
    await sendStaffPush({
      title: "Payment received",
      body: `${profile.full_name ?? profile.email} — ${dollars(totalCents + wash.totalCents || session.amount_total || 0)} for ${dog.name}`,
      data: { type: "payment", customerId },
    });
    return;
  }
}

/**
 * Settle an in-person (Tap to Pay) PaymentIntent. Mirrors the drop-in checkout
 * branch but keys off the PI id stamped on the bookings/add-ons at intent
 * creation, rather than a Checkout Session.
 */
async function handleTerminalSucceeded(svc: Svc, intent: Stripe.PaymentIntent) {
  const { data: bookingRows } = await svc
    .from("bookings")
    .update({ payment_status: "paid" })
    .eq("stripe_payment_intent_id", intent.id)
    .eq("payment_status", "unpaid")
    .select(
      "id, customer_id, dog_id, service_kind, service_date, service_end_date, unit_price_cents, credit_applied_cents",
    );
  const bookings = bookingRows ?? [];

  // Flip any add-ons paid by this intent and total them for the receipt.
  const { data: addonRows } = await svc
    .from("booking_addons")
    .update({ payment_status: "paid" })
    .eq("stripe_payment_intent_id", intent.id)
    .eq("payment_status", "unpaid")
    .select("amount_cents");
  const washTotal = ((addonRows ?? []) as { amount_cents: number }[]).reduce(
    (s, a) => s + a.amount_cents,
    0,
  );
  const washCount = (addonRows ?? []).length;

  if (bookings.length === 0) {
    // Add-on-only tap (rare) — nothing more to do beyond marking it paid.
    return;
  }

  const customerCreditUsed = bookings.reduce(
    (sum, b) => sum + (b.credit_applied_cents ?? 0),
    0,
  );
  if (customerCreditUsed > 0) {
    await deductAccountCredit(svc, bookings[0].customer_id, customerCreditUsed);
  }
  await creditReferralIfFirstPaid(svc, bookings[0].customer_id);

  const [{ data: profile }, { data: dog }] = await Promise.all([
    svc.from("profiles").select("email, full_name").eq("id", bookings[0].customer_id).maybeSingle(),
    svc.from("dogs").select("name").eq("id", bookings[0].dog_id).maybeSingle(),
  ]);
  if (!profile?.email || !dog) return;

  const dates: string[] = [];
  let totalCents = 0;
  let unitCount = 0;
  for (const b of bookings) {
    let cur = b.service_date;
    while (cur < b.service_end_date) {
      dates.push(cur);
      unitCount += 1;
      totalCents += b.unit_price_cents ?? 0;
      cur = addDays(cur, 1);
    }
  }
  dates.sort();
  const anyBoarding = bookings.some((b) => b.service_kind === "boarding");
  const unit = anyBoarding ? "night" : "day";

  await sendBookingConfirmation({
    to: profile.email,
    customerName: profile.full_name ?? profile.email,
    dogName: dog.name,
    dates,
    paidByPackageCount: 0,
    dropInCount: unitCount,
    dropInTotalCents: totalCents,
  });
  await sendPaymentReceipt({
    to: profile.email,
    customerName: profile.full_name ?? profile.email,
    description: `${anyBoarding ? "Boarding" : "Drop-in"} for ${dog.name} × ${unitCount} ${unit}${unitCount === 1 ? "" : "s"}${washCount > 0 ? " + dog wash" : ""} (tap to pay)`,
    amountCents: intent.amount_received || intent.amount || totalCents + washTotal,
    paidAt: new Date(),
  });
  await sendStaffPush({
    title: "Payment received (tap)",
    body: `${profile.full_name ?? profile.email} — ${dollars(intent.amount_received || intent.amount || totalCents + washTotal)} for ${dog.name}`,
    data: { type: "payment", customerId: bookings[0].customer_id },
  });
}

/** A failed in-person tap — leave bookings unpaid; clear the stamped intent. */
async function handleTerminalFailed(svc: Svc, intent: Stripe.PaymentIntent) {
  await svc
    .from("bookings")
    .update({ stripe_payment_intent_id: null })
    .eq("stripe_payment_intent_id", intent.id)
    .eq("payment_status", "unpaid");
  await svc
    .from("booking_addons")
    .update({ stripe_payment_intent_id: null })
    .eq("stripe_payment_intent_id", intent.id)
    .eq("payment_status", "unpaid");
  await sendStaffPush({
    title: "Tap payment failed",
    body: "An in-person payment didn't go through — try again or take another card.",
    data: { type: "payment_failed" },
  });
}

async function deductAccountCredit(
  svc: Svc,
  customerId: string,
  cents: number,
) {
  const { data } = await svc
    .from("profiles")
    .select("account_credit_cents")
    .eq("id", customerId)
    .maybeSingle<{ account_credit_cents: number }>();
  const current = data?.account_credit_cents ?? 0;
  const next = Math.max(0, current - cents);
  if (next !== current) {
    await svc
      .from("profiles")
      .update({ account_credit_cents: next })
      .eq("id", customerId);
  }
}

async function creditReferralIfFirstPaid(svc: Svc, customerId: string) {
  const { data: referral } = await svc
    .from("referrals")
    .select("id, referrer_id, referred_id, status, credit_cents")
    .eq("referred_id", customerId)
    .eq("status", "pending")
    .maybeSingle<{
      id: string;
      referrer_id: string;
      referred_id: string;
      status: string;
      credit_cents: number;
    }>();
  if (!referral) return;

  // Only credit on the FIRST paid booking — count paid bookings (the row we
  // just updated is included). If there's more than one paid, the referral
  // was already missed and we leave it pending so a staff member can decide.
  const { count } = await svc
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .eq("payment_status", "paid");
  if ((count ?? 0) !== 1) return;

  const cents = referral.credit_cents ?? 1000;
  const ids = [referral.referrer_id, referral.referred_id];
  for (const id of ids) {
    const { data } = await svc
      .from("profiles")
      .select("account_credit_cents")
      .eq("id", id)
      .maybeSingle<{ account_credit_cents: number }>();
    const current = data?.account_credit_cents ?? 0;
    await svc
      .from("profiles")
      .update({ account_credit_cents: current + cents })
      .eq("id", id);
  }

  await svc
    .from("referrals")
    .update({ status: "credited", credited_at: new Date().toISOString() })
    .eq("id", referral.id);
}

async function handleCheckoutFailed(
  svc: Svc,
  session: Stripe.Checkout.Session,
) {
  const kind = session.metadata?.kind;
  await markAddonsFailedBySession(svc, session.id);
  if (kind === "package") {
    await svc
      .from("customer_packages")
      .update({ payment_status: "failed" })
      .eq("stripe_checkout_session_id", session.id);
  } else if (kind === "drop_in" || kind === "boarding") {
    await svc
      .from("bookings")
      .update({ payment_status: "failed", status: "canceled" })
      .eq("stripe_checkout_session_id", session.id);
  }
  await sendStaffPush({
    title: "Payment failed",
    body: "A customer's payment didn't go through.",
    data: { type: "payment_failed" },
  });
}

import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { sendBookingConfirmation, sendPaymentReceipt } from "@/lib/email";
import { addDays } from "@/lib/format";

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
      .select("id, customer_id, dog_id, service_date, service_end_date, unit_price_cents");
    const bookings = bookingRows ?? [];
    if (bookings.length === 0) return;

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
      description: `${isBoarding ? "Boarding" : "Drop-in"} for ${dog.name} × ${unitCount} ${unit}${unitCount === 1 ? "" : "s"}`,
      amountCents: totalCents || session.amount_total || 0,
      paidAt: new Date(),
    });
    return;
  }
}

async function handleCheckoutFailed(
  svc: Svc,
  session: Stripe.Checkout.Session,
) {
  const kind = session.metadata?.kind;
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
}

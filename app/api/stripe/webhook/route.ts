import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

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
    await svc
      .from("customer_packages")
      .update({
        payment_status: "paid",
        stripe_payment_intent_id: paymentIntentId,
      })
      .eq("stripe_checkout_session_id", session.id);
    return;
  }

  if (kind === "drop_in") {
    await svc
      .from("bookings")
      .update({
        payment_status: "paid",
        stripe_payment_intent_id: paymentIntentId,
      })
      .eq("stripe_checkout_session_id", session.id);
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
  } else if (kind === "drop_in") {
    await svc
      .from("bookings")
      .update({ payment_status: "failed", status: "canceled" })
      .eq("stripe_checkout_session_id", session.id);
  }
}

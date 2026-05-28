import "server-only";
import Stripe from "stripe";

declare global {
  var __stripe: Stripe | undefined;
}

export function getStripe(): Stripe {
  if (!global.__stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    global.__stripe = new Stripe(key, {
      // Pin a stable API version; bump deliberately.
      apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
      typescript: true,
    });
  }
  return global.__stripe;
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

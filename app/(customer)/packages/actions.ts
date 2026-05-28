"use server";

import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { appUrl, getStripe } from "@/lib/stripe";
import type { Package } from "@/lib/supabase/types";

export async function buyPackage(formData: FormData) {
  const { userId, profile } = await requireCustomer();
  const package_id = String(formData.get("package_id") ?? "");

  const supabase = await createClient();
  const { data: pkg } = await supabase
    .from("packages")
    .select("*")
    .eq("id", package_id)
    .eq("active", true)
    .maybeSingle<Package>();

  if (!pkg) {
    redirect("/packages?error=Package+not+available");
  }

  const stripe = getStripe();
  const lineItem = pkg.stripe_price_id
    ? { price: pkg.stripe_price_id, quantity: 1 }
    : {
        price_data: {
          currency: "usd",
          product_data: {
            name: pkg.name,
            description: pkg.description ?? `${pkg.days_included}-day day care pack`,
          },
          unit_amount: pkg.price_cents,
        },
        quantity: 1,
      };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: profile.email,
    line_items: [lineItem],
    success_url: `${appUrl()}/packages?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/packages?status=canceled`,
    metadata: {
      kind: "package",
      customer_id: userId,
      package_id: pkg.id,
      days_included: String(pkg.days_included),
    },
  });

  // Pre-create the customer_packages row in `unpaid` state so webhook can flip it.
  await supabase.from("customer_packages").insert({
    customer_id: userId,
    package_id: pkg.id,
    days_total: pkg.days_included,
    days_remaining: pkg.days_included,
    amount_paid_cents: pkg.price_cents,
    stripe_checkout_session_id: session.id,
    payment_status: "unpaid",
  });

  if (!session.url) redirect("/packages?error=Stripe+session+failed");
  redirect(session.url);
}

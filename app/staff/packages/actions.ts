"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export async function savePackage(formData: FormData) {
  await requireStaff();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const days_included = Number(formData.get("days_included") ?? 0);
  const price_cents = Number(formData.get("price_cents") ?? 0);

  if (!name || days_included < 1 || price_cents < 0) return;

  // Create a Stripe Product + Price for this package so checkouts can
  // reference the price by ID (clean Stripe reporting). If Stripe is
  // unreachable we still create the DB row — checkout will fall back to
  // ad-hoc price_data.
  let stripe_product_id: string | null = null;
  let stripe_price_id: string | null = null;
  try {
    const stripe = getStripe();
    const product = await stripe.products.create({
      name,
      description: description ?? `${days_included}-day day care pack`,
    });
    const price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: price_cents,
    });
    stripe_product_id = product.id;
    stripe_price_id = price.id;
  } catch (err) {
    console.error("Stripe product/price create failed:", err);
  }

  const supabase = await createClient();
  await supabase.from("packages").insert({
    name,
    description,
    days_included,
    price_cents,
    active: true,
    sort_order: 99,
    stripe_product_id,
    stripe_price_id,
  });
  revalidatePath("/staff/packages");
}

export async function togglePackage(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("packages").update({ active }).eq("id", id);
  revalidatePath("/staff/packages");
}

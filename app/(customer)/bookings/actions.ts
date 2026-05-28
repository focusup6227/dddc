"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  cancelBookingWithRefund,
  createBookingCheckoutSession,
  isPastDueUnpaid,
} from "@/lib/bookings.server";
import { appUrl } from "@/lib/stripe";
import type { Booking } from "@/lib/supabase/types";

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

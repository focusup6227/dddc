"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cancelBookingWithRefund } from "@/lib/bookings.server";
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

  await cancelBookingWithRefund({ booking, actorId: userId, actorRole: "customer" });

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Booking } from "@/lib/supabase/types";

export async function customerAddBelonging(formData: FormData) {
  const { userId } = await requireCustomer();
  const booking_id = String(formData.get("booking_id") ?? "");
  const item = String(formData.get("item") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!booking_id || !item) return;

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id")
    .eq("id", booking_id)
    .maybeSingle<Pick<Booking, "id" | "customer_id">>();
  if (!booking || booking.customer_id !== userId) {
    redirect("/bookings?error=Booking+not+found");
  }

  await supabase.from("booking_belongings").insert({
    booking_id,
    item,
    notes,
    added_by: userId,
  });

  revalidatePath("/bookings");
  redirect("/bookings");
}

export async function customerDeleteBelonging(formData: FormData) {
  const { userId } = await requireCustomer();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/bookings");

  const supabase = await createClient();
  // RLS ensures only the owner can delete their belongings.
  await supabase.from("booking_belongings").delete().eq("id", id);
  void userId;
  revalidatePath("/bookings");
  redirect("/bookings");
}

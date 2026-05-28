"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function paths(bookingId: string) {
  revalidatePath(`/kiosk/booking/${bookingId}`);
  revalidatePath(`/bookings`);
  revalidatePath(`/staff/bookings`);
}

export async function addBelonging(formData: FormData) {
  const { userId } = await requireStaff();
  const booking_id = String(formData.get("booking_id") ?? "");
  const item = String(formData.get("item") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!booking_id || !item) return;

  const supabase = await createClient();
  await supabase.from("booking_belongings").insert({
    booking_id,
    item,
    notes,
    added_by: userId,
  });
  paths(booking_id);
}

export async function markBelongingIn(formData: FormData) {
  const { userId } = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const booking_id = String(formData.get("booking_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("booking_belongings")
    .update({
      brought_in_at: new Date().toISOString(),
      brought_in_by: userId,
    })
    .eq("id", id);
  if (booking_id) paths(booking_id);
}

export async function markBelongingOut(formData: FormData) {
  const { userId } = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const booking_id = String(formData.get("booking_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("booking_belongings")
    .update({
      returned_at: new Date().toISOString(),
      returned_by: userId,
    })
    .eq("id", id);
  if (booking_id) paths(booking_id);
}

export async function deleteBelonging(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const booking_id = String(formData.get("booking_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("booking_belongings").delete().eq("id", id);
  if (booking_id) paths(booking_id);
}

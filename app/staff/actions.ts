"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CheckIn } from "@/lib/supabase/types";

export async function checkInBooking(formData: FormData) {
  const { userId } = await requireStaff();
  const booking_id = String(formData.get("booking_id") ?? "");
  if (!booking_id) return;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("check_ins")
    .select("*")
    .eq("booking_id", booking_id)
    .maybeSingle<CheckIn>();

  if (existing) {
    await supabase
      .from("check_ins")
      .update({ checked_in_at: new Date().toISOString(), checked_in_by: userId })
      .eq("booking_id", booking_id);
  } else {
    await supabase.from("check_ins").insert({
      booking_id,
      checked_in_at: new Date().toISOString(),
      checked_in_by: userId,
    });
  }

  await supabase.from("bookings").update({ status: "checked_in" }).eq("id", booking_id);
  revalidatePath("/staff");
}

export async function checkOutBooking(formData: FormData) {
  const { userId } = await requireStaff();
  const booking_id = String(formData.get("booking_id") ?? "");
  if (!booking_id) return;

  const supabase = await createClient();
  await supabase
    .from("check_ins")
    .update({ checked_out_at: new Date().toISOString(), checked_out_by: userId })
    .eq("booking_id", booking_id);

  await supabase.from("bookings").update({ status: "checked_out" }).eq("id", booking_id);
  revalidatePath("/staff");
}

export async function addDogNote(formData: FormData) {
  const { userId } = await requireStaff();
  const dog_id = String(formData.get("dog_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const booking_id = String(formData.get("booking_id") ?? "") || null;
  if (!dog_id || !note) return;

  const supabase = await createClient();
  await supabase.from("dog_notes").insert({
    dog_id,
    note,
    author_id: userId,
    booking_id,
  });
  revalidatePath(`/staff/dogs/${dog_id}`);
}

export async function updateStaffNotes(formData: FormData) {
  await requireStaff();
  const dog_id = String(formData.get("dog_id") ?? "");
  const staff_notes = String(formData.get("staff_notes") ?? "");
  if (!dog_id) return;

  const supabase = await createClient();
  await supabase.from("dogs").update({ staff_notes }).eq("id", dog_id);
  revalidatePath(`/staff/dogs/${dog_id}`);
}

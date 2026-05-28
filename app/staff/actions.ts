"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cancelBookingWithRefund } from "@/lib/bookings.server";
import { notifyWaitlistForOpening } from "@/lib/waitlist.server";
import type {
  Booking,
  CheckIn,
  DogLogKind,
} from "@/lib/supabase/types";

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

export async function staffCancelBooking(formData: FormData) {
  const { userId } = await requireStaff();
  const id = String(formData.get("booking_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!id) return;

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle<Booking>();
  if (!booking) return;

  await cancelBookingWithRefund({ booking, actorId: userId, actorRole: "staff", reason });

  await notifyWaitlistForOpening({
    serviceDate: booking.service_date,
    serviceEndDate: booking.service_end_date,
    serviceKind: booking.service_kind,
  });

  revalidatePath("/staff/bookings");
  revalidatePath("/staff");
  revalidatePath(`/staff/dogs/${booking.dog_id}`);
  revalidatePath(`/staff/customers/${booking.customer_id}`);
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

const DOG_LOG_KINDS_ALLOWED: DogLogKind[] = [
  "meal",
  "medication",
  "potty",
  "water",
  "rest",
];

export async function addDogLogEntry(formData: FormData) {
  const { userId } = await requireStaff();
  const dog_id = String(formData.get("dog_id") ?? "");
  const kindRaw = String(formData.get("kind") ?? "") as DogLogKind;
  const detail = String(formData.get("detail") ?? "").trim() || null;
  const booking_id = String(formData.get("booking_id") ?? "") || null;
  if (!dog_id || !DOG_LOG_KINDS_ALLOWED.includes(kindRaw)) return;

  const supabase = await createClient();
  await supabase.from("dog_log_entries").insert({
    dog_id,
    kind: kindRaw,
    detail,
    booking_id,
    given_by: userId,
  });
  revalidatePath(`/staff/dogs/${dog_id}`);
  if (booking_id) revalidatePath(`/kiosk/booking/${booking_id}`);
}

export async function deleteDogLogEntry(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const dog_id = String(formData.get("dog_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("dog_log_entries").delete().eq("id", id);
  if (dog_id) revalidatePath(`/staff/dogs/${dog_id}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { requireFullStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendReportCardReady } from "@/lib/email";
import type { Booking, Dog, Profile, ReportCard } from "@/lib/supabase/types";

const BUCKET = "report-card-photos";

async function getOrCreateCard(
  bookingId: string,
  userId: string,
): Promise<ReportCard> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("report_cards")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle<ReportCard>();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("report_cards")
    .insert({ booking_id: bookingId, created_by: userId, note: "" })
    .select("*")
    .single<ReportCard>();
  if (error || !created) throw new Error(error?.message ?? "Failed to create card");
  return created;
}

export async function saveReportCardNote(formData: FormData) {
  const { userId } = await requireFullStaff();
  const booking_id = String(formData.get("booking_id") ?? "");
  const note = String(formData.get("note") ?? "");
  if (!booking_id) return;

  const card = await getOrCreateCard(booking_id, userId);
  const supabase = await createClient();
  await supabase.from("report_cards").update({ note }).eq("id", card.id);

  revalidatePath(`/staff/report-cards/${booking_id}`);
  revalidatePath("/staff/report-cards");
}

export async function addReportCardPhoto(formData: FormData) {
  const { userId } = await requireFullStaff();
  const booking_id = String(formData.get("booking_id") ?? "");
  const storage_path = String(formData.get("storage_path") ?? "");
  const caption = String(formData.get("caption") ?? "").trim() || null;
  const photo_date = String(formData.get("photo_date") ?? "") || null;
  if (!booking_id || !storage_path) return;

  const card = await getOrCreateCard(booking_id, userId);

  const supabase = await createClient();
  // sort_order = max + 1 so new photos land at the end.
  const { data: maxRow } = await supabase
    .from("report_card_photos")
    .select("sort_order")
    .eq("report_card_id", card.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();
  const sort_order = (maxRow?.sort_order ?? -1) + 1;

  await supabase.from("report_card_photos").insert({
    report_card_id: card.id,
    storage_path,
    caption,
    photo_date,
    sort_order,
    uploaded_by: userId,
  });

  revalidatePath(`/staff/report-cards/${booking_id}`);
}

export async function deleteReportCardPhoto(formData: FormData) {
  await requireFullStaff();
  const booking_id = String(formData.get("booking_id") ?? "");
  const photo_id = String(formData.get("photo_id") ?? "");
  const storage_path = String(formData.get("storage_path") ?? "");
  if (!booking_id || !photo_id) return;

  const supabase = await createClient();
  await supabase.from("report_card_photos").delete().eq("id", photo_id);
  if (storage_path) {
    await supabase.storage.from(BUCKET).remove([storage_path]);
  }

  revalidatePath(`/staff/report-cards/${booking_id}`);
}

export async function publishReportCard(formData: FormData) {
  const { userId } = await requireFullStaff();
  const booking_id = String(formData.get("booking_id") ?? "");
  if (!booking_id) return;

  const card = await getOrCreateCard(booking_id, userId);
  const wasPublished = card.published_at !== null;

  const supabase = await createClient();
  await supabase
    .from("report_cards")
    .update({
      published_at: new Date().toISOString(),
      published_by: userId,
    })
    .eq("id", card.id);

  revalidatePath(`/staff/report-cards/${booking_id}`);
  revalidatePath("/staff/report-cards");

  // Only send the "your card is ready" email on first publish — not re-publishes.
  if (!wasPublished) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .maybeSingle<Booking>();
    if (booking) {
      const [custRes, dogRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .eq("id", booking.customer_id)
          .maybeSingle<Profile>(),
        supabase
          .from("dogs")
          .select("*")
          .eq("id", booking.dog_id)
          .maybeSingle<Dog>(),
      ]);
      const cust = custRes.data;
      const dog = dogRes.data;
      if (cust?.email && dog?.name) {
        await sendReportCardReady({
          to: cust.email,
          customerName: cust.full_name || cust.email,
          dogName: dog.name,
          serviceKind: booking.service_kind,
          serviceDate: booking.service_date,
          serviceEndDate: booking.service_end_date,
        });
      }
    }
  }
}

export async function unpublishReportCard(formData: FormData) {
  await requireFullStaff();
  const booking_id = String(formData.get("booking_id") ?? "");
  if (!booking_id) return;

  const supabase = await createClient();
  await supabase
    .from("report_cards")
    .update({ published_at: null, published_by: null })
    .eq("booking_id", booking_id);

  revalidatePath(`/staff/report-cards/${booking_id}`);
  revalidatePath("/staff/report-cards");
}

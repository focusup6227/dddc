"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFullStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function createEvent(formData: FormData) {
  await requireFullStaff();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const start_date = String(formData.get("start_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "") || start_date;

  if (!title || !ISO_RE.test(start_date) || !ISO_RE.test(end_date)) {
    redirect("/staff/events?error=Title+and+a+valid+date+range+are+required");
  }
  if (end_date < start_date) {
    redirect("/staff/events?error=End+date+must+be+on+or+after+start+date");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("events").insert({
    title,
    description,
    start_date,
    end_date,
  });
  if (error) {
    redirect(`/staff/events?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/staff/events");
  redirect("/staff/events?saved=1");
}

export async function updateEvent(formData: FormData) {
  await requireFullStaff();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const start_date = String(formData.get("start_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "") || start_date;

  if (!id || !title || !ISO_RE.test(start_date) || !ISO_RE.test(end_date)) {
    redirect("/staff/events?error=Title+and+a+valid+date+range+are+required");
  }
  if (end_date < start_date) {
    redirect("/staff/events?error=End+date+must+be+on+or+after+start+date");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ title, description, start_date, end_date })
    .eq("id", id);
  if (error) {
    redirect(`/staff/events?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/staff/events");
  redirect("/staff/events?saved=1");
}

export async function deleteEvent(formData: FormData) {
  await requireFullStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("events").delete().eq("id", id);
  revalidatePath("/staff/events");
}

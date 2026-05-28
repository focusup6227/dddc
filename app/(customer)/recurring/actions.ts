"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { materializeForCustomer } from "@/lib/recurring.server";
import { isTimeInWindow } from "@/lib/hours";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function createRecurring(formData: FormData) {
  const { userId } = await requireCustomer();
  const dog_id = String(formData.get("dog_id") ?? "");
  const start_date = String(formData.get("start_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "").trim() || null;
  const drop_off_time = String(formData.get("drop_off_time") ?? "");
  const pickup_time = String(formData.get("pickup_time") ?? "");
  const weekdays: number[] = [];
  for (let i = 0; i < 7; i++) {
    if (formData.get(`weekday_${i}`) === "on") weekdays.push(i);
  }

  if (!dog_id || !ISO_RE.test(start_date)) {
    redirect("/recurring?error=Pick+a+dog+and+a+start+date");
  }
  if (end_date && (!ISO_RE.test(end_date) || end_date < start_date)) {
    redirect("/recurring?error=End+date+must+be+on+or+after+start+date");
  }
  if (weekdays.length === 0) {
    redirect("/recurring?error=Pick+at+least+one+day+of+the+week");
  }
  if (
    !isTimeInWindow(drop_off_time) ||
    !isTimeInWindow(pickup_time) ||
    pickup_time <= drop_off_time
  ) {
    redirect(
      "/recurring?error=Pick+a+drop-off+and+pickup+between+6+AM+and+6+PM",
    );
  }

  const supabase = await createClient();
  const { data: dog } = await supabase
    .from("dogs")
    .select("id")
    .eq("id", dog_id)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!dog) redirect("/recurring?error=Dog+not+found");

  const { error } = await supabase.from("recurring_bookings").insert({
    customer_id: userId,
    dog_id,
    weekdays,
    start_date,
    end_date,
    drop_off_time,
    pickup_time,
  });
  if (error) {
    redirect(`/recurring?error=${encodeURIComponent(error.message)}`);
  }

  const { created } = await materializeForCustomer(userId);
  revalidatePath("/recurring");
  revalidatePath("/bookings");
  redirect(`/recurring?saved=1&created=${created}`);
}

export async function toggleRecurring(formData: FormData) {
  const { userId } = await requireCustomer();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("recurring_bookings")
    .update({ active })
    .eq("id", id)
    .eq("customer_id", userId);
  if (active) await materializeForCustomer(userId);
  revalidatePath("/recurring");
  revalidatePath("/bookings");
}

export async function deleteRecurring(formData: FormData) {
  const { userId } = await requireCustomer();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("recurring_bookings")
    .delete()
    .eq("id", id)
    .eq("customer_id", userId);
  revalidatePath("/recurring");
}

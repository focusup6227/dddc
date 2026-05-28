"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Dog } from "@/lib/supabase/types";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function joinWaitlist(formData: FormData) {
  const { userId } = await requireCustomer();
  const dog_id = String(formData.get("dog_id") ?? "");
  const service_date = String(formData.get("service_date") ?? "");
  const service_kind = String(formData.get("service_kind") ?? "daycare");
  const back = String(formData.get("back") ?? "/book");

  if (!dog_id || !ISO_RE.test(service_date)) {
    redirect(`${back}?error=${encodeURIComponent("Pick a dog and date.")}`);
  }
  if (service_kind !== "daycare" && service_kind !== "boarding") {
    redirect(`${back}?error=Invalid+service`);
  }

  const supabase = await createClient();

  const { data: dog } = await supabase
    .from("dogs")
    .select("*")
    .eq("id", dog_id)
    .eq("owner_id", userId)
    .maybeSingle<Dog>();
  if (!dog) redirect(`${back}?error=Dog+not+found`);

  const { error } = await supabase.from("waitlist_entries").insert({
    customer_id: userId,
    dog_id,
    service_date,
    service_kind,
  });
  if (error) {
    // Unique-index violation = already on the list — treat as success.
    if (!error.message.toLowerCase().includes("duplicate")) {
      redirect(`${back}?error=${encodeURIComponent(error.message)}`);
    }
  }

  revalidatePath("/bookings");
  revalidatePath("/waitlist");
  redirect(`${back}?waitlisted=1`);
}

export async function leaveWaitlist(formData: FormData) {
  const { userId } = await requireCustomer();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/waitlist");

  const supabase = await createClient();
  await supabase
    .from("waitlist_entries")
    .update({ status: "canceled" })
    .eq("id", id)
    .eq("customer_id", userId);

  revalidatePath("/waitlist");
  redirect("/waitlist");
}

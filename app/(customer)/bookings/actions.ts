"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Booking, CustomerPackage } from "@/lib/supabase/types";

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
  if (!booking || booking.status !== "reserved") return;

  const svc = createServiceClient();
  await svc.from("bookings").update({ status: "canceled" }).eq("id", id);

  // Refund the package day if it was funded by a package.
  if (booking.payment_kind === "package" && booking.customer_package_id) {
    const { data: pkg } = await svc
      .from("customer_packages")
      .select("*")
      .eq("id", booking.customer_package_id)
      .maybeSingle<CustomerPackage>();
    if (pkg && pkg.days_remaining < pkg.days_total) {
      await svc
        .from("customer_packages")
        .update({ days_remaining: pkg.days_remaining + 1 })
        .eq("id", pkg.id);
    }
  }

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
}

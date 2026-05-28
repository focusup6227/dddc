"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireFullStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function str(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export async function createCoupon(formData: FormData) {
  await requireFullStaff();

  const code = str(formData.get("code"))?.toUpperCase().replace(/\s+/g, "");
  const dollars = str(formData.get("discount_per_day"));
  const description = str(formData.get("description"));
  const expires_on = str(formData.get("expires_on"));

  if (!code) {
    redirect("/staff/coupons?error=" + encodeURIComponent("Code is required."));
  }
  if (!/^[A-Z0-9_-]+$/.test(code)) {
    redirect(
      "/staff/coupons?error=" +
        encodeURIComponent("Use letters, numbers, _ or - only."),
    );
  }
  const cents = dollars ? Math.round(Number(dollars) * 100) : 0;
  if (!Number.isFinite(cents) || cents <= 0) {
    redirect(
      "/staff/coupons?error=" +
        encodeURIComponent("Discount must be a positive amount."),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("coupons").insert({
    code,
    description,
    discount_per_day_cents: cents,
    expires_on,
  });
  if (error) {
    redirect(
      "/staff/coupons?error=" +
        encodeURIComponent(
          error.code === "23505" ? "That code already exists." : error.message,
        ),
    );
  }

  revalidatePath("/staff/coupons");
  redirect("/staff/coupons?saved=1");
}

export async function toggleCoupon(formData: FormData) {
  await requireFullStaff();
  const id = str(formData.get("id"));
  if (!id) redirect("/staff/coupons");

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("coupons")
    .select("active")
    .eq("id", id)
    .maybeSingle<{ active: boolean }>();
  if (!row) redirect("/staff/coupons");

  await supabase
    .from("coupons")
    .update({ active: !row.active })
    .eq("id", id);

  revalidatePath("/staff/coupons");
  redirect("/staff/coupons?saved=1");
}

export async function deleteCoupon(formData: FormData) {
  await requireFullStaff();
  const id = str(formData.get("id"));
  if (!id) redirect("/staff/coupons");

  const supabase = await createClient();
  // Bookings reference coupon_id with ON DELETE — we set up no cascade, so
  // first detach any stamped bookings (preserves their discount snapshot
  // via coupon_discount_cents) before removing the row.
  await supabase
    .from("bookings")
    .update({ coupon_id: null })
    .eq("coupon_id", id);
  await supabase.from("coupons").delete().eq("id", id);

  revalidatePath("/staff/coupons");
  redirect("/staff/coupons?saved=1");
}

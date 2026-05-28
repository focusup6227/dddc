"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function parsePositiveInt(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

function parsePositiveDollarsToCents(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export async function saveSettings(formData: FormData) {
  await requireStaff();
  const dayRaw = String(formData.get("max_dogs_per_day") ?? "").trim();
  const nightRaw = String(formData.get("max_dogs_per_night") ?? "").trim();
  const boardingRaw = String(formData.get("boarding_rate_dollars") ?? "").trim();
  const day = parsePositiveInt(dayRaw);
  const night = parsePositiveInt(nightRaw);
  const boardingCents = parsePositiveDollarsToCents(boardingRaw);
  if (day === null || night === null || boardingCents === null) {
    redirect("/staff/settings?error=Enter+positive+numbers+for+all+fields");
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("settings").upsert(
    [
      { key: "max_dogs_per_day", value: String(day), updated_at: now },
      { key: "max_dogs_per_night", value: String(night), updated_at: now },
      { key: "boarding_rate_cents", value: String(boardingCents), updated_at: now },
    ],
    { onConflict: "key" },
  );

  if (error) {
    redirect(`/staff/settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff/settings");
  redirect("/staff/settings?saved=1");
}

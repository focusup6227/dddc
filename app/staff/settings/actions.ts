"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function saveSettings(formData: FormData) {
  await requireStaff();
  const raw = String(formData.get("max_dogs_per_day") ?? "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    redirect("/staff/settings?error=Enter+a+positive+number");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .upsert(
      { key: "max_dogs_per_day", value: String(Math.floor(n)), updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );

  if (error) {
    redirect(`/staff/settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff/settings");
  redirect("/staff/settings?saved=1");
}

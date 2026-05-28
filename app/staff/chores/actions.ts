"use server";

import { revalidatePath } from "next/cache";
import { requireFullStaff, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ChoreRecurrence } from "@/lib/supabase/types";

export async function completeChore(formData: FormData) {
  const { userId } = await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("chores")
    .update({
      completed_at: new Date().toISOString(),
      completed_by: userId,
    })
    .eq("id", id);
  revalidatePath("/staff/chores");
}

export async function uncompleteChore(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("chores")
    .update({ completed_at: null, completed_by: null })
    .eq("id", id);
  revalidatePath("/staff/chores");
}

export async function createManualChore(formData: FormData) {
  const { userId } = await requireStaff();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const recurrence = String(formData.get("recurrence") ?? "none") as ChoreRecurrence;
  const description =
    String(formData.get("description") ?? "").trim() || null;

  const supabase = await createClient();

  if (recurrence === "none") {
    const due_date = String(formData.get("due_date") ?? "");
    if (!due_date) return;
    await supabase.from("chores").insert({
      kind: "manual",
      title,
      description,
      due_date,
      created_by: userId,
    });
  } else {
    // Template row. Instances are materialized on read by ensureAutoChoresForDate.
    const weekdayRaw = formData.get("weekday");
    const weekday =
      recurrence === "weekly" && weekdayRaw !== null
        ? Number(weekdayRaw)
        : null;
    await supabase.from("chores").insert({
      kind: "manual",
      title,
      description,
      recurrence,
      weekday,
      created_by: userId,
    });
  }

  revalidatePath("/staff/chores");
}

export async function deleteChore(formData: FormData) {
  await requireFullStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("chores").delete().eq("id", id);
  revalidatePath("/staff/chores");
}

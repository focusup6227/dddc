"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFullStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function returnTo(formData: FormData): string {
  const month = String(formData.get("month") ?? "");
  return month ? `/staff/calendar?month=${month}` : "/staff/calendar";
}

export async function createEvent(formData: FormData) {
  await requireFullStaff();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const start_date = String(formData.get("start_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "") || start_date;
  const back = returnTo(formData);

  if (!title || !ISO_RE.test(start_date) || !ISO_RE.test(end_date)) {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}error=Title+and+a+valid+date+range+are+required`,
    );
  }
  if (end_date < start_date) {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}error=End+date+must+be+on+or+after+start+date`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .insert({ title, description, start_date, end_date });
  if (error) {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath("/staff/calendar");
  redirect(back);
}

export async function updateEvent(formData: FormData) {
  await requireFullStaff();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const start_date = String(formData.get("start_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "") || start_date;
  const back = returnTo(formData);

  if (!id || !title || !ISO_RE.test(start_date) || !ISO_RE.test(end_date)) {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}error=Title+and+a+valid+date+range+are+required`,
    );
  }
  if (end_date < start_date) {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}error=End+date+must+be+on+or+after+start+date`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ title, description, start_date, end_date })
    .eq("id", id);
  if (error) {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath("/staff/calendar");
  redirect(back);
}

export async function deleteEvent(formData: FormData) {
  await requireFullStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("events").delete().eq("id", id);
  revalidatePath("/staff/calendar");
}

export async function createBlackout(formData: FormData) {
  await requireFullStaff();
  const start_date = String(formData.get("start_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "") || start_date;
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const blocks_daycare = formData.get("blocks_daycare") === "on";
  const blocks_boarding = formData.get("blocks_boarding") === "on";
  const back = returnTo(formData);

  if (!ISO_RE.test(start_date) || !ISO_RE.test(end_date)) {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}error=Pick+valid+dates`,
    );
  }
  if (end_date < start_date) {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}error=End+date+must+be+on+or+after+start+date`,
    );
  }
  if (!blocks_daycare && !blocks_boarding) {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}error=Pick+at+least+one+service+to+block`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("blackouts").insert({
    start_date,
    end_date,
    reason,
    blocks_daycare,
    blocks_boarding,
  });
  if (error) {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath("/staff/calendar");
  redirect(back);
}

export async function updateBlackout(formData: FormData) {
  await requireFullStaff();
  const id = String(formData.get("id") ?? "");
  const start_date = String(formData.get("start_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "") || start_date;
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const blocks_daycare = formData.get("blocks_daycare") === "on";
  const blocks_boarding = formData.get("blocks_boarding") === "on";
  const back = returnTo(formData);

  if (!id || !ISO_RE.test(start_date) || !ISO_RE.test(end_date)) {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}error=Pick+valid+dates`,
    );
  }
  if (end_date < start_date) {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}error=End+date+must+be+on+or+after+start+date`,
    );
  }
  if (!blocks_daycare && !blocks_boarding) {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}error=Pick+at+least+one+service+to+block`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("blackouts")
    .update({ start_date, end_date, reason, blocks_daycare, blocks_boarding })
    .eq("id", id);
  if (error) {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath("/staff/calendar");
  redirect(back);
}

export async function deleteBlackout(formData: FormData) {
  await requireFullStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("blackouts").delete().eq("id", id);
  revalidatePath("/staff/calendar");
}

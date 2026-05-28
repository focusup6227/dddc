"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function signWaiver(formData: FormData) {
  const { userId } = await requireCustomer();
  const waiver_id = String(formData.get("waiver_id") ?? "");
  const signed_full_name = String(formData.get("signed_full_name") ?? "").trim();
  const agree = formData.get("agree") === "yes";

  if (!waiver_id || !signed_full_name || !agree) {
    redirect(`/waiver?error=${encodeURIComponent("Please type your name and check the agreement box.")}`);
  }

  const h = await headers();
  // Best-effort IP extraction; works behind Vercel / most proxies.
  const xff = h.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const ua = h.get("user-agent") ?? null;

  const supabase = await createClient();
  const { error } = await supabase.from("waiver_signatures").insert({
    user_id: userId,
    waiver_id,
    signed_full_name,
    ip_address: ip,
    user_agent: ua,
  });

  if (error) {
    redirect(`/waiver?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dogs/new");
}

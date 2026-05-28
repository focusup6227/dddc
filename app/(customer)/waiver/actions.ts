"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendWaiverSignedReceipt } from "@/lib/email";
import type { Waiver } from "@/lib/supabase/types";

export async function signWaiver(formData: FormData) {
  const { userId, profile } = await requireCustomer();
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

  const { data: waiver } = await supabase
    .from("waivers")
    .select("title, version")
    .eq("id", waiver_id)
    .maybeSingle<Pick<Waiver, "title" | "version">>();

  await sendWaiverSignedReceipt({
    to: profile.email,
    customerName: profile.full_name ?? profile.email,
    signedFullName: signed_full_name,
    signedAt: new Date(),
    ip,
    waiverTitle: waiver?.title ?? "Liability Waiver",
    waiverVersion: waiver?.version ?? "1",
  });

  redirect("/dogs/new");
}

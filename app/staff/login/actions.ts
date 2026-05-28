"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function staffLogin(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/staff/login?error=${encodeURIComponent(error.message)}`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/staff/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: "customer" | "staff" }>();

  if (profile?.role !== "staff") {
    await supabase.auth.signOut();
    redirect(`/staff/login?error=${encodeURIComponent("This account is not a staff account.")}`);
  }

  redirect("/staff");
}

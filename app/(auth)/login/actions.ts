"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const msg = encodeURIComponent(error.message);
    redirect(`/login?error=${msg}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  // Send to role-appropriate landing page.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: "customer" | "staff" }>();

  if (next) redirect(next);
  redirect(profile?.role === "staff" ? "/staff" : "/dashboard");
}

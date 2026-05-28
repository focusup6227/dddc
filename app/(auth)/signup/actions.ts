"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (password.length < 8) {
    redirect(`/signup?error=${encodeURIComponent("Password must be at least 8 characters.")}`);
  }

  const supabase = await createClient();
  const { error: signUpError, data } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name },
    },
  });

  if (signUpError || !data.user) {
    redirect(`/signup?error=${encodeURIComponent(signUpError?.message ?? "Sign up failed.")}`);
  }

  // Profile row was auto-created by the on_auth_user_created trigger.
  // Update phone (and refresh full_name in case it didn't pick up).
  await supabase
    .from("profiles")
    .update({ phone, full_name })
    .eq("id", data.user.id);

  // If email confirmations are enabled, the user won't be signed in yet.
  // The auth helpers will route accordingly; just send them to the next step.
  redirect("/waiver");
}

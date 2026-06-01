"use server";

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendStaffPush } from "@/lib/push.server";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const smsOptIn = formData.get("sms_opt_in") != null;
  const ref = String(formData.get("ref") ?? "").trim().toUpperCase();

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

  await supabase
    .from("profiles")
    .update({
      phone,
      full_name,
      sms_opt_in: smsOptIn,
      // Record consent time as proof; notify_prefs keeps its all-on default.
      sms_opt_in_at: smsOptIn ? new Date().toISOString() : null,
    })
    .eq("id", data.user.id);

  if (ref) {
    // RLS would block the new user from inserting a row whose referrer_id is
    // someone else, so use the service client. Silently ignore unknown codes.
    const svc = createServiceClient();
    const { data: referrer } = await svc
      .from("profiles")
      .select("id")
      .eq("referral_code", ref)
      .maybeSingle<{ id: string }>();
    if (referrer && referrer.id !== data.user.id) {
      await svc.from("referrals").insert({
        referrer_id: referrer.id,
        referred_id: data.user.id,
        status: "pending",
      });
    }
  }

  await sendStaffPush({
    title: "New customer",
    body: `${full_name || email} just signed up`,
    data: { type: "new_customer", customerId: data.user.id },
  });

  redirect("/waiver");
}

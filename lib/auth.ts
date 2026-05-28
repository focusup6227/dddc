import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

/**
 * Get the current user + profile, or null if not logged in.
 * Safe to call from any server context.
 */
export async function getSessionProfile(): Promise<{
  userId: string;
  profile: Profile;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile) return null;
  return { userId: user.id, profile };
}

/** Require any logged-in user. Redirects to /login if not. */
export async function requireUser(loginPath = "/login") {
  const session = await getSessionProfile();
  if (!session) redirect(loginPath);
  return session;
}

/** Require a staff member. Redirects non-staff to the customer dashboard. */
export async function requireStaff() {
  const session = await requireUser("/staff/login");
  if (session.profile.role !== "staff") redirect("/dashboard");
  return session;
}

/** Require a customer (i.e. not staff). */
export async function requireCustomer() {
  const session = await requireUser("/login");
  if (session.profile.role === "staff") redirect("/staff");
  return session;
}

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

/**
 * Require any staff member (full or junior). Use for pages junior staff
 * should be able to view (Today, Schedule, Bookings, Dogs, Chores).
 */
export async function requireStaff() {
  const session = await requireUser("/staff/login");
  if (!isAnyStaff(session.profile)) redirect("/dashboard");
  return session;
}

/**
 * Require a senior (full) staff member. Use for admin-only surfaces:
 * Numbers, Customers, Vaccines, Incidents, Report cards, Settings, Kiosk.
 * Junior staff get bounced to the staff home (Today).
 */
export async function requireFullStaff() {
  const session = await requireUser("/staff/login");
  if (session.profile.role !== "staff") redirect("/staff");
  return session;
}

/** Require a customer (i.e. not staff). */
export async function requireCustomer() {
  const session = await requireUser("/login");
  if (isAnyStaff(session.profile)) redirect("/staff");
  return session;
}

export function isAnyStaff(profile: Pick<Profile, "role"> | null | undefined) {
  return profile?.role === "staff" || profile?.role === "junior_staff";
}

export function isJuniorStaff(
  profile: Pick<Profile, "role"> | null | undefined,
) {
  return profile?.role === "junior_staff";
}

export function isFullStaff(
  profile: Pick<Profile, "role"> | null | undefined,
) {
  return profile?.role === "staff";
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireFullStaff } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/stripe";

function str(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

type Role = "customer" | "junior_staff" | "staff";
const ROLES = new Set<Role>(["customer", "junior_staff", "staff"]);

function err(msg: string): never {
  redirect("/staff/team?error=" + encodeURIComponent(msg));
}

/**
 * Invite a junior_staff member by email. If the email is already a customer,
 * promote them. If they're already on the team, error. Otherwise send a
 * Supabase invite email; the recipient sets a password via /auth/callback →
 * /onboarding/set-password.
 */
export async function inviteJuniorStaff(formData: FormData) {
  await requireFullStaff();
  const emailRaw = str(formData.get("email"))?.toLowerCase();
  if (!emailRaw) err("Email is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) err("Invalid email.");

  const svc = createServiceClient();

  // Already on file?
  const { data: existing } = await svc
    .from("profiles")
    .select("id, role")
    .ilike("email", emailRaw)
    .maybeSingle<{ id: string; role: Role }>();

  if (existing) {
    if (existing.role === "staff" || existing.role === "junior_staff") {
      err("That email is already on the team.");
    }
    // Promote existing customer to junior_staff in place.
    const { error } = await svc
      .from("profiles")
      .update({ role: "junior_staff" })
      .eq("id", existing.id);
    if (error) err(error.message);
    revalidatePath("/staff/team");
    redirect("/staff/team?saved=" + encodeURIComponent("Account promoted to junior staff."));
  }

  // New email — send a Supabase invite.
  const redirectTo = `${appUrl()}/auth/callback?next=${encodeURIComponent("/onboarding/set-password")}`;
  const { data, error } = await svc.auth.admin.inviteUserByEmail(emailRaw, {
    redirectTo,
  });
  if (error || !data.user) {
    err(error?.message ?? "Failed to send invite.");
  }

  // Promote the freshly-minted profile.
  const { error: roleErr } = await svc
    .from("profiles")
    .update({ role: "junior_staff" })
    .eq("id", data.user.id);
  if (roleErr) err(roleErr.message);

  revalidatePath("/staff/team");
  redirect("/staff/team?saved=" + encodeURIComponent("Invite sent."));
}

export async function changeUserRole(formData: FormData) {
  const session = await requireFullStaff();
  const id = str(formData.get("id"));
  const role = str(formData.get("role")) as Role | null;
  if (!id || !role || !ROLES.has(role)) err("Invalid request.");

  if (id === session.userId) err("You can't change your own role.");

  const svc = createServiceClient();

  // Don't allow demoting the last senior staff.
  if (role !== "staff") {
    const { count } = await svc
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "staff");
    const seniorCount = count ?? 0;

    const { data: target } = await svc
      .from("profiles")
      .select("role")
      .eq("id", id)
      .maybeSingle<{ role: Role }>();

    if (target?.role === "staff" && seniorCount <= 1) {
      err("Can't demote the last senior staff member.");
    }
  }

  const { error } = await svc
    .from("profiles")
    .update({ role })
    .eq("id", id);
  if (error) err(error.message);

  revalidatePath("/staff/team");
  redirect("/staff/team?saved=" + encodeURIComponent("Role updated."));
}

export async function resendInvite(formData: FormData) {
  await requireFullStaff();
  const email = str(formData.get("email"))?.toLowerCase();
  if (!email) err("Email is required.");

  const svc = createServiceClient();
  const redirectTo = `${appUrl()}/auth/callback?next=${encodeURIComponent("/onboarding/set-password")}`;
  const { error } = await svc.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });
  if (error) err(error.message);

  revalidatePath("/staff/team");
  redirect("/staff/team?saved=" + encodeURIComponent("Invite re-sent."));
}

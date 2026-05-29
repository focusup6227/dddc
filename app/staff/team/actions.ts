"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireFullStaff } from "@/lib/auth";
import { sendStaffInvite } from "@/lib/email";
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
 * promote them in place. If they're already on the team, error.
 * Otherwise we use Supabase's admin `generateLink` to create the user + mint
 * a magic link, then deliver the invite ourselves via Resend so it looks
 * like the rest of our transactional email.
 */
export async function inviteJuniorStaff(formData: FormData) {
  const session = await requireFullStaff();
  const inviterName =
    session.profile.full_name?.trim() || session.profile.email;
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
    // Promote existing customer to junior_staff in place — they already
    // have a password and can sign in normally.
    const { error } = await svc
      .from("profiles")
      .update({ role: "junior_staff" })
      .eq("id", existing.id);
    if (error) err(error.message);
    revalidatePath("/staff/team");
    redirect("/staff/team?saved=" + encodeURIComponent("Account promoted to junior staff."));
  }

  // New email — mint a magic link via the admin API (this creates the user
  // but does NOT send an email), then deliver via Resend.
  const redirectTo = `${appUrl()}/auth/callback?next=${encodeURIComponent("/onboarding/set-password")}`;
  const { data, error } = await svc.auth.admin.generateLink({
    type: "invite",
    email: emailRaw,
    options: { redirectTo },
  });
  if (error || !data?.user || !data.properties?.action_link) {
    err(error?.message ?? "Failed to create invite.");
  }

  // Promote the freshly-minted profile.
  const { error: roleErr } = await svc
    .from("profiles")
    .update({ role: "junior_staff" })
    .eq("id", data.user.id);
  if (roleErr) err(roleErr.message);

  await sendStaffInvite({
    to: emailRaw,
    inviterName,
    actionUrl: data.properties.action_link,
  });

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

/**
 * Edit a team member's profile details (name, phone, address, emergency
 * contact). Senior-staff only. Email is intentionally not editable here —
 * it's the auth login identity. Only applies to team members.
 */
export async function updateTeamMember(formData: FormData) {
  await requireFullStaff();
  const id = str(formData.get("id"));
  if (!id) err("Invalid request.");

  const svc = createServiceClient();

  // Only allow editing actual team members.
  const { data: target } = await svc
    .from("profiles")
    .select("role")
    .eq("id", id)
    .maybeSingle<{ role: Role }>();
  if (!target || (target.role !== "staff" && target.role !== "junior_staff")) {
    err("That account isn't a team member.");
  }

  const { error } = await svc
    .from("profiles")
    .update({
      full_name: str(formData.get("full_name")) ?? "",
      phone: str(formData.get("phone")),
      address: str(formData.get("address")),
      emergency_contact_name: str(formData.get("emergency_contact_name")),
      emergency_contact_phone: str(formData.get("emergency_contact_phone")),
    })
    .eq("id", id);
  if (error) err(error.message);

  revalidatePath(`/staff/team/${id}`);
  revalidatePath("/staff/team");
  redirect(`/staff/team/${id}?saved=` + encodeURIComponent("Details updated."));
}

export async function resendInvite(formData: FormData) {
  const session = await requireFullStaff();
  const inviterName =
    session.profile.full_name?.trim() || session.profile.email;
  const email = str(formData.get("email"))?.toLowerCase();
  if (!email) err("Email is required.");

  const svc = createServiceClient();
  // The user already exists, so 'magiclink' is the right type — it gives
  // them a fresh login link without trying to re-create the account.
  const redirectTo = `${appUrl()}/auth/callback?next=${encodeURIComponent("/onboarding/set-password")}`;
  const { data, error } = await svc.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (error || !data?.properties?.action_link) {
    err(error?.message ?? "Failed to generate link.");
  }

  await sendStaffInvite({
    to: email,
    inviterName,
    actionUrl: data.properties.action_link,
    resend: true,
  });

  revalidatePath("/staff/team");
  redirect("/staff/team?saved=" + encodeURIComponent("Invite re-sent."));
}

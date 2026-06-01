"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireFullStaff } from "@/lib/auth";
import { sendCustomerWelcome } from "@/lib/email";
import { createServiceClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/stripe";
import { addDays } from "@/lib/format";
import { isTimeInWindow } from "@/lib/hours";
import { getBoardingRateCents } from "@/lib/settings";
import {
  applyAccountCouponToOpenBookings,
  clearAccountCouponFromOpenBookings,
} from "@/lib/coupons.server";
import type { Coupon, Package, ServiceKind } from "@/lib/supabase/types";

function str(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function num(v: FormDataEntryValue | null): number | null {
  const s = str(v);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function listErr(msg: string): never {
  redirect("/staff/customers?error=" + encodeURIComponent(msg));
}

function customerErr(id: string, msg: string): never {
  redirect(`/staff/customers/${id}?error=` + encodeURIComponent(msg));
}

/**
 * Create a customer on a walk-in's behalf. Mints a real auth account (so they
 * can log in later) via the admin generateLink API — the same mechanism the
 * staff-invite flow uses — then fills in their profile. Optionally emails them
 * a "set your password" link via Resend.
 */
export async function createCustomer(formData: FormData) {
  await requireFullStaff();

  const full_name = str(formData.get("full_name"));
  const emailRaw = str(formData.get("email"))?.toLowerCase();
  const phone = str(formData.get("phone"));
  const address = str(formData.get("address"));
  const emergency_contact_name = str(formData.get("emergency_contact_name"));
  const emergency_contact_phone = str(formData.get("emergency_contact_phone"));
  const sendInvite = formData.get("send_invite") === "yes";

  if (!full_name) listErr("Name is required.");
  if (!emailRaw) listErr("Email is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) listErr("Invalid email.");

  const svc = createServiceClient();

  // Already on file? Send staff to the existing record rather than erroring.
  const { data: existing } = await svc
    .from("profiles")
    .select("id, role")
    .ilike("email", emailRaw)
    .maybeSingle<{ id: string; role: string }>();

  if (existing) {
    if (existing.role !== "customer") {
      listErr("That email belongs to a staff account.");
    }
    redirect(
      `/staff/customers/${existing.id}?saved=` +
        encodeURIComponent("That email already had an account — opened it."),
    );
  }

  // Mint the auth user + invite link (does not send an email itself).
  const redirectTo = `${appUrl()}/auth/callback?next=${encodeURIComponent("/onboarding/set-password")}`;
  const { data, error } = await svc.auth.admin.generateLink({
    type: "invite",
    email: emailRaw,
    options: { redirectTo, data: { full_name } },
  });
  if (error || !data?.user || !data.properties?.action_link) {
    listErr(error?.message ?? "Failed to create the account.");
  }

  // Fill in the profile the trigger just created.
  const { error: profErr } = await svc
    .from("profiles")
    .update({
      full_name,
      phone,
      address,
      emergency_contact_name,
      emergency_contact_phone,
    })
    .eq("id", data.user.id);
  if (profErr) listErr(profErr.message);

  if (sendInvite) {
    await sendCustomerWelcome({
      to: emailRaw,
      customerName: full_name,
      actionUrl: data.properties.action_link,
    });
  }

  revalidatePath("/staff/customers");
  redirect(
    `/staff/customers/${data.user.id}?saved=` +
      encodeURIComponent(
        sendInvite ? "Customer created — welcome email sent." : "Customer created.",
      ),
  );
}

/**
 * Edit a customer's profile details (name, phone, address, emergency contact).
 * Senior-staff only. Email is the auth login and isn't editable here. Only
 * applies to customer accounts.
 */
export async function updateCustomer(formData: FormData) {
  await requireFullStaff();
  const id = str(formData.get("id"));
  if (!id) listErr("Invalid request.");

  const svc = createServiceClient();

  const { data: target } = await svc
    .from("profiles")
    .select("role")
    .eq("id", id)
    .maybeSingle<{ role: string }>();
  if (!target || target.role !== "customer") {
    customerErr(id, "That account isn't a customer.");
  }

  const full_name = str(formData.get("full_name"));
  if (!full_name) customerErr(id, "Name is required.");

  const { error } = await svc
    .from("profiles")
    .update({
      full_name,
      phone: str(formData.get("phone")),
      address: str(formData.get("address")),
      emergency_contact_name: str(formData.get("emergency_contact_name")),
      emergency_contact_phone: str(formData.get("emergency_contact_phone")),
    })
    .eq("id", id);
  if (error) customerErr(id, error.message);

  revalidatePath(`/staff/customers/${id}`);
  redirect(`/staff/customers/${id}?saved=` + encodeURIComponent("Customer updated."));
}

/**
 * Re-send a customer their account setup link. The auth user already exists,
 * so we mint a fresh magic link (not an invite) and deliver it via Resend —
 * the same mechanism the staff-invite resend uses.
 */
export async function resendCustomerInvite(formData: FormData) {
  await requireFullStaff();
  const id = str(formData.get("id"));
  if (!id) listErr("Invalid request.");

  const svc = createServiceClient();
  const { data: customer } = await svc
    .from("profiles")
    .select("email, full_name, role")
    .eq("id", id)
    .maybeSingle<{ email: string; full_name: string; role: string }>();
  if (!customer) customerErr(id, "Customer not found.");
  if (customer.role !== "customer") customerErr(id, "That account isn't a customer.");

  const redirectTo = `${appUrl()}/auth/callback?next=${encodeURIComponent("/onboarding/set-password")}`;
  const { data, error } = await svc.auth.admin.generateLink({
    type: "magiclink",
    email: customer.email,
    options: { redirectTo },
  });
  if (error || !data?.properties?.action_link) {
    customerErr(id, error?.message ?? "Failed to generate link.");
  }

  await sendCustomerWelcome({
    to: customer.email,
    customerName: customer.full_name,
    actionUrl: data.properties.action_link,
    resend: true,
  });

  redirect(`/staff/customers/${id}?saved=` + encodeURIComponent("Account link re-sent."));
}

/**
 * Attach a coupon to a customer's account. Its per-day/night discount then
 * auto-applies to their bookings — the DB trigger stamps new ones, and we
 * back-fill any open (unpaid) bookings here. Swapping coupons clears the old
 * one off those open bookings first.
 */
export async function setCustomerCoupon(formData: FormData) {
  await requireFullStaff();
  const id = str(formData.get("id"));
  const coupon_id = str(formData.get("coupon_id"));
  if (!id) listErr("Invalid request.");
  if (!coupon_id) customerErr(id, "Pick a coupon.");

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role, account_coupon_id")
    .eq("id", id)
    .maybeSingle<{ role: string; account_coupon_id: string | null }>();
  if (!profile || profile.role !== "customer") {
    customerErr(id, "That account isn't a customer.");
  }

  const { data: coupon } = await svc
    .from("coupons")
    .select("*")
    .eq("id", coupon_id)
    .maybeSingle<Coupon>();
  if (!coupon) customerErr(id, "Coupon not found.");
  if (!coupon!.active) customerErr(id, "That coupon is inactive.");

  // Clear a previously-attached coupon off open bookings before swapping.
  if (profile!.account_coupon_id && profile!.account_coupon_id !== coupon_id) {
    await clearAccountCouponFromOpenBookings(svc, id!, profile!.account_coupon_id);
  }

  await svc.from("profiles").update({ account_coupon_id: coupon_id }).eq("id", id!);
  await applyAccountCouponToOpenBookings(svc, id!, coupon!);

  revalidatePath(`/staff/customers/${id}`);
  redirect(
    `/staff/customers/${id}?saved=` +
      encodeURIComponent(`Coupon ${coupon!.code} applied to the account.`),
  );
}

/** Detach the account coupon and strip it from the customer's open bookings. */
export async function removeCustomerCoupon(formData: FormData) {
  await requireFullStaff();
  const id = str(formData.get("id"));
  if (!id) listErr("Invalid request.");

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("account_coupon_id")
    .eq("id", id)
    .maybeSingle<{ account_coupon_id: string | null }>();

  await svc.from("profiles").update({ account_coupon_id: null }).eq("id", id!);
  if (profile?.account_coupon_id) {
    await clearAccountCouponFromOpenBookings(svc, id!, profile.account_coupon_id);
  }

  revalidatePath(`/staff/customers/${id}`);
  redirect(
    `/staff/customers/${id}?saved=` +
      encodeURIComponent("Account coupon removed."),
  );
}

/** Add a dog to a customer's file (staff acting on their behalf). */
export async function addDogForCustomer(formData: FormData) {
  await requireFullStaff();
  const owner_id = str(formData.get("owner_id"));
  if (!owner_id) listErr("Missing customer.");

  const name = str(formData.get("name"));
  if (!name) customerErr(owner_id, "Dog name is required.");

  const payload = {
    owner_id,
    name,
    breed: str(formData.get("breed")),
    sex: str(formData.get("sex")) as "male" | "female" | null,
    spayed_neutered: formData.get("spayed_neutered") === "yes",
    date_of_birth: str(formData.get("date_of_birth")),
    weight_lbs: num(formData.get("weight_lbs")),
    color: str(formData.get("color")),
    vet_name: str(formData.get("vet_name")),
    vet_phone: str(formData.get("vet_phone")),
    health_issues: str(formData.get("health_issues")),
    medications: str(formData.get("medications")),
    gets_along_with: formData
      .getAll("gets_along_with")
      .map((v) => String(v))
      .filter(Boolean),
    feeding_notes: str(formData.get("feeding_notes")),
    behavior_notes: str(formData.get("behavior_notes")),
    additional_notes: str(formData.get("additional_notes")),
  };

  const svc = createServiceClient();
  const { error } = await svc.from("dogs").insert(payload);
  if (error) customerErr(owner_id, error.message);

  revalidatePath(`/staff/customers/${owner_id}`);
  redirect(`/staff/customers/${owner_id}?saved=` + encodeURIComponent(`${name} added.`));
}

/** Look up the cheapest active 1-day day-care rate, in cents. */
async function getDaycareDropInCents(): Promise<number | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("packages")
    .select("*")
    .eq("active", true)
    .eq("days_included", 1)
    .order("price_cents")
    .limit(1)
    .maybeSingle<Package>();
  return data?.price_cents ?? null;
}

/**
 * Book a customer's dog on their behalf, payable at drop-off (drop_in /
 * unpaid / reserved). Deliberately skips the vaccine and capacity gates that
 * guard the self-serve flow — staff are making this call knowingly — but the
 * one-booking-per-dog-per-day constraint still applies.
 */
export async function createStaffBooking(formData: FormData) {
  await requireFullStaff();

  const customer_id = str(formData.get("customer_id"));
  const dog_id = str(formData.get("dog_id"));
  if (!customer_id) listErr("Missing customer.");
  if (!dog_id) customerErr(customer_id, "Pick a dog.");

  const kind = (str(formData.get("service_kind")) ?? "daycare") as ServiceKind;
  const drop_off_time = str(formData.get("drop_off_time")) ?? "08:00";
  const pickup_time = str(formData.get("pickup_time")) ?? "17:00";

  if (!isTimeInWindow(drop_off_time) || !isTimeInWindow(pickup_time)) {
    customerErr(customer_id, "Drop-off and pickup must be between 6 AM and 6 PM.");
  }

  const svc = createServiceClient();

  // Verify the dog belongs to this customer.
  const { data: dog } = await svc
    .from("dogs")
    .select("id, name, owner_id")
    .eq("id", dog_id)
    .eq("owner_id", customer_id)
    .maybeSingle<{ id: string; name: string; owner_id: string }>();
  if (!dog) customerErr(customer_id, "Dog not found for this customer.");

  if (kind === "boarding") {
    const checkIn = str(formData.get("check_in"));
    const checkOut = str(formData.get("check_out"));
    if (!checkIn || !ISO_RE.test(checkIn) || !checkOut || !ISO_RE.test(checkOut)) {
      customerErr(customer_id, "Pick valid check-in and check-out dates.");
    }
    if (checkOut <= checkIn) {
      customerErr(customer_id, "Check-out must be after check-in.");
    }
    const rateCents = await getBoardingRateCents();
    const { error } = await svc.from("bookings").insert({
      customer_id,
      dog_id,
      service_date: checkIn,
      service_end_date: checkOut,
      drop_off_time,
      pickup_time,
      service_kind: "boarding",
      status: "reserved",
      payment_kind: "drop_in",
      unit_price_cents: rateCents,
      payment_status: "unpaid",
    });
    if (error) {
      const dup = error.message.toLowerCase().includes("duplicate");
      customerErr(
        customer_id,
        dup ? `${dog.name} already has a booking on those dates.` : error.message,
      );
    }
  } else {
    const date = str(formData.get("service_date"));
    if (!date || !ISO_RE.test(date)) {
      customerErr(customer_id, "Pick a valid day.");
    }
    const priceCents = await getDaycareDropInCents();
    if (priceCents == null) {
      customerErr(customer_id, "No day-care rate is configured yet.");
    }
    const { error } = await svc.from("bookings").insert({
      customer_id,
      dog_id,
      service_date: date,
      service_end_date: addDays(date!, 1),
      drop_off_time,
      pickup_time,
      service_kind: "daycare",
      status: "reserved",
      payment_kind: "drop_in",
      unit_price_cents: priceCents,
      payment_status: "unpaid",
    });
    if (error) {
      const dup = error.message.toLowerCase().includes("duplicate");
      customerErr(
        customer_id,
        dup ? `${dog.name} is already booked that day.` : error.message,
      );
    }
  }

  revalidatePath(`/staff/customers/${customer_id}`);
  revalidatePath("/staff/bookings");
  redirect(
    `/staff/customers/${customer_id}?saved=` +
      encodeURIComponent(`Booked ${dog.name} — payment due at drop-off.`),
  );
}

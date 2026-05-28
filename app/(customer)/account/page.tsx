import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Referral } from "@/lib/supabase/types";
import { formatMoney } from "@/lib/format";
import { appUrl } from "@/lib/stripe";
import { saveProfile } from "./actions";
import { ReferralShare } from "./ReferralShare";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { userId, profile } = await requireCustomer();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: referralsData } = await supabase
    .from("referrals")
    .select("*")
    .eq("referrer_id", userId)
    .order("created_at", { ascending: false });
  const referrals = (referralsData ?? []) as Referral[];
  const credited = referrals.filter((r) => r.status === "credited").length;
  const pending = referrals.filter((r) => r.status === "pending").length;

  const shareUrl = profile.referral_code
    ? `${appUrl()}/signup?ref=${profile.referral_code}`
    : "";

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-stone-900">Account</h1>

      {params.saved && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved.
        </div>
      )}
      {params.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {params.error}
        </div>
      )}

      <section className="card">
        <h2 className="font-semibold text-stone-900">Account credit</h2>
        <p className="mt-1 text-3xl font-bold text-stone-900">
          {formatMoney(profile.account_credit_cents)}
        </p>
        <p className="mt-1 text-sm text-stone-500">
          Credit is applied automatically when you pay for a booking.
        </p>
      </section>

      <section className="card">
        <h2 className="font-semibold text-stone-900">Refer a friend</h2>
        <p className="mt-1 text-sm text-stone-600">
          You get $10 in credit for every friend who signs up with your link and
          completes their first booking. They get $10 off too.
        </p>
        {profile.referral_code ? (
          <div className="mt-4 space-y-3">
            <ReferralShare code={profile.referral_code} url={shareUrl} />
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-md bg-stone-50 px-3 py-2">
                <p className="text-xs text-stone-500">Friends credited</p>
                <p className="text-xl font-semibold text-stone-900">{credited}</p>
              </div>
              <div className="rounded-md bg-stone-50 px-3 py-2">
                <p className="text-xs text-stone-500">Pending</p>
                <p className="text-xl font-semibold text-stone-900">{pending}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-stone-500">
            Your referral code will appear here shortly. Reload the page.
          </p>
        )}
      </section>

      <form action={saveProfile} className="card space-y-4">
        <div>
          <h2 className="font-semibold text-stone-900">Your details</h2>
          <p className="mt-1 text-xs text-stone-500">
            Used for booking confirmations and account contact.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field name="full_name" label="Full name" required defaultValue={profile.full_name} />
          <Field
            name="phone"
            label="Phone"
            type="tel"
            defaultValue={profile.phone ?? ""}
          />
        </div>
        <Field
          name="address"
          label="Address"
          defaultValue={profile.address ?? ""}
        />

        <div className="border-t border-stone-200 pt-4">
          <h3 className="font-semibold text-stone-900">Emergency contact</h3>
          <p className="mt-1 text-xs text-stone-500">
            Who should we call if we can&apos;t reach you while your dog is with us?
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              name="emergency_contact_name"
              label="Contact name"
              defaultValue={profile.emergency_contact_name ?? ""}
            />
            <Field
              name="emergency_contact_phone"
              label="Contact phone"
              type="tel"
              defaultValue={profile.emergency_contact_phone ?? ""}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary">Save</button>
        </div>
      </form>

      <p className="text-sm text-stone-500">
        Need to update your email or password?{" "}
        <Link href="/login" className="text-brand-700 hover:underline">
          Sign out and reset
        </Link>
        .
      </p>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="input"
      />
    </div>
  );
}

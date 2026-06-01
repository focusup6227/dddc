import Link from "next/link";
import { Heart, Sparkles, Wallet } from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Referral } from "@/lib/supabase/types";
import { formatMoney } from "@/lib/format";
import { appUrl } from "@/lib/stripe";
import { HeartPaw } from "@/components/illustrations";
import { ToastNotifier } from "@/components/ToastNotifier";
import { saveProfile } from "./actions";
import { ReferralShare } from "./ReferralShare";

const TOASTS = [
  { param: "saved", message: "Saved." },
  { param: "error", tone: "error" as const },
];

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
    <div className="space-y-8 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900">Account</h1>
        <p className="mt-1 text-sm text-ink-500">
          Your contact details, account credit, and referral link.
        </p>
      </div>

      <ToastNotifier toasts={TOASTS} />

      <section className="card relative overflow-hidden">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Account credit
            </p>
            <p className="mt-2 font-display text-4xl font-bold text-ink-900">
              {formatMoney(profile.account_credit_cents)}
            </p>
            <p className="mt-2 max-w-md text-sm text-ink-500">
              Credit is applied automatically when you pay for a booking. We&apos;ll
              use whichever saves you more — credit or coupon.
            </p>
          </div>
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 sm:flex">
            <Wallet size={22} />
          </span>
        </div>
      </section>

      <section className="card">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Refer a friend
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink-900">
              Give $10, get $10
            </h2>
            <p className="mt-1 text-sm text-ink-700">
              When a friend signs up with your link and completes their first
              booking, you both get $10 in credit.
            </p>
          </div>
          <span className="hidden h-16 w-16 shrink-0 text-brand-400 sm:block">
            <HeartPaw className="h-full w-full" />
          </span>
        </div>
        {profile.referral_code ? (
          <div className="mt-5 space-y-3">
            <ReferralShare code={profile.referral_code} url={shareUrl} />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-cream-100 px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  <Heart size={12} /> Credited
                </div>
                <p className="mt-1 font-display text-2xl font-semibold text-ink-900">
                  {credited}
                </p>
              </div>
              <div className="rounded-xl bg-cream-100 px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  <Sparkles size={12} /> Pending
                </div>
                <p className="mt-1 font-display text-2xl font-semibold text-ink-900">
                  {pending}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-500">
            Your referral code will appear here shortly. Reload the page.
          </p>
        )}
      </section>

      <form action={saveProfile} className="card space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Your details
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-ink-900">
            Contact info
          </h2>
          <p className="mt-1 text-sm text-ink-500">
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

        <div className="border-t border-stone-200/80 pt-5">
          <h3 className="font-display text-lg font-semibold text-ink-900">
            Text notifications
          </h3>
          <p className="mt-1 text-sm text-ink-500">
            Get booking updates by text in addition to email. Standard message
            rates may apply. Reply STOP to any text to opt out.
          </p>
          <label className="mt-3 flex items-start gap-3">
            <input
              type="checkbox"
              name="sms_opt_in"
              defaultChecked={profile.sms_opt_in}
              className="mt-1 h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-ink-900">
              Text me about my bookings
              <span className="mt-0.5 block text-xs text-ink-500">
                Requires a phone number above.
              </span>
            </span>
          </label>
          <fieldset className="mt-3 space-y-2 pl-7">
            <legend className="sr-only">Which texts?</legend>
            <NotifyToggle
              name="notify_confirmations"
              label="Booking confirmations"
              defaultChecked={profile.notify_prefs?.confirmations ?? true}
            />
            <NotifyToggle
              name="notify_reminders"
              label="Day-before reminders"
              defaultChecked={profile.notify_prefs?.reminders ?? true}
            />
            <NotifyToggle
              name="notify_report_cards"
              label="Report card notifications"
              defaultChecked={profile.notify_prefs?.report_cards ?? true}
            />
          </fieldset>
        </div>

        <div className="border-t border-stone-200/80 pt-5">
          <h3 className="font-display text-lg font-semibold text-ink-900">
            Emergency contact
          </h3>
          <p className="mt-1 text-sm text-ink-500">
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

      <p className="text-sm text-ink-500">
        Need to update your email or password?{" "}
        <Link href="/login" className="text-brand-700 hover:underline">
          Sign out and reset
        </Link>
        .
      </p>
    </div>
  );
}

function NotifyToggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-ink-700">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
      />
      {label}
    </label>
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

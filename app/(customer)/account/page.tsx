import Link from "next/link";
import { Bell, Heart, Sparkles, Trash2, Wallet } from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AuthorizedPickup, Referral } from "@/lib/supabase/types";
import { formatMoney } from "@/lib/format";
import { appUrl } from "@/lib/stripe";
import { vapidPublicKey } from "@/lib/push.server";
import { HeartPaw } from "@/components/illustrations";
import {
  addAuthorizedPickup,
  removeAuthorizedPickup,
  saveProfile,
} from "./actions";
import { ReferralShare } from "./ReferralShare";
import { PushToggle } from "./PushToggle";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { userId, profile } = await requireCustomer();
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: referralsData }, { data: pickupsData }] = await Promise.all([
    supabase
      .from("referrals")
      .select("*")
      .eq("referrer_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("authorized_pickups")
      .select("*")
      .eq("customer_id", userId)
      .order("created_at"),
  ]);
  const referrals = (referralsData ?? []) as Referral[];
  const pickups = (pickupsData ?? []) as AuthorizedPickup[];
  const credited = referrals.filter((r) => r.status === "credited").length;
  const pending = referrals.filter((r) => r.status === "pending").length;

  const shareUrl = profile.referral_code
    ? `${appUrl()}/signup?ref=${profile.referral_code}`
    : "";
  const pubKey = vapidPublicKey();

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900">Account</h1>
        <p className="mt-1 text-sm text-ink-500">
          Your contact details, account credit, and referral link.
        </p>
      </div>

      {params.saved && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800 shadow-soft">
          Saved.
        </div>
      )}
      {params.error && (
        <div className="rounded-2xl border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-800 shadow-soft">
          {params.error}
        </div>
      )}

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

      <section className="card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Notifications
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink-900">
              Push to this device
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              We&apos;ll buzz you when there&apos;s a pickup-ready note, a new
              report card, or a waitlist spot opens.
            </p>
          </div>
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 sm:flex">
            <Bell size={22} />
          </span>
        </div>
        <div className="mt-4">
          <PushToggle vapidPublicKey={pubKey} />
        </div>
      </section>

      <section className="card">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Authorized pickup
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-ink-900">
            Who else can pick up your dog?
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Anyone on this list can take your dog home. Staff sees this list at
            the kiosk.
          </p>
        </div>

        {pickups.length > 0 && (
          <ul className="mt-4 divide-y divide-stone-200/80 rounded-2xl border border-stone-200/80">
            {pickups.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">{p.name}</p>
                  <p className="text-xs text-ink-500">
                    {[p.relation, p.phone].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {p.notes && (
                    <p className="mt-1 text-xs text-ink-500">{p.notes}</p>
                  )}
                </div>
                <form action={removeAuthorizedPickup}>
                  <input type="hidden" name="id" value={p.id} />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
                  >
                    <Trash2 size={12} /> Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={addAuthorizedPickup} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field name="name" label="Name" required />
            <Field name="phone" label="Phone" type="tel" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field name="relation" label="Relation (e.g. partner)" />
            <Field name="notes" label="Notes (e.g. weekdays only)" />
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn-secondary">
              Add pickup
            </button>
          </div>
        </form>
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

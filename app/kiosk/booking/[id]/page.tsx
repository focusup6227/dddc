import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFullStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateShort, formatMoney } from "@/lib/format";
import {
  DEFAULT_DROP_OFF_TIME,
  DEFAULT_PICKUP_TIME,
  EARLIEST_TIME,
  LATEST_TIME,
  formatTime,
} from "@/lib/hours";
import { DOG_WASH_PRICE_CENTS } from "@/lib/settings";
import { DogAvatar } from "@/components/DogAvatar";
import { ToastNotifier } from "@/components/ToastNotifier";
import type {
  Booking,
  BookingAddon,
  CheckIn,
  Dog,
  DogVaccination,
  Profile,
} from "@/lib/supabase/types";
import {
  REQUIRED_VACCINES,
  summarizeCoverage,
  type VaccineCoverage,
} from "@/lib/vaccines";
import {
  kioskAddDogWash,
  kioskCheckIn,
  kioskCheckOut,
  kioskTakePayment,
  kioskUpdateStay,
} from "../../actions";

const TOASTS = [
  { param: "paid", message: "Payment received." },
  { param: "canceled", tone: "info" as const, message: "Payment canceled." },
  { param: "updated", message: "Stay updated." },
  { param: "error", tone: "error" as const },
];

const hhmm = (t: string | null, fallback: string) =>
  t ? t.slice(0, 5) : fallback;

function nightCount(start: string, end: string): number {
  const [y1, m1, d1] = start.split("-").map(Number);
  const [y2, m2, d2] = end.split("-").map(Number);
  return Math.max(
    0,
    Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000),
  );
}

export const dynamic = "force-dynamic";

export default async function KioskBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireFullStaff();
  const { id } = await params;
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle<Booking>();
  if (!booking) notFound();

  const [{ data: dog }, { data: cust }, { data: ci }, { data: vaxRows }, { data: addonRows }] =
    await Promise.all([
      supabase.from("dogs").select("*").eq("id", booking.dog_id).maybeSingle<Dog>(),
      supabase.from("profiles").select("*").eq("id", booking.customer_id).maybeSingle<Profile>(),
      supabase.from("check_ins").select("*").eq("booking_id", booking.id).maybeSingle<CheckIn>(),
      supabase.from("dog_vaccinations").select("*").eq("dog_id", booking.dog_id),
      supabase.from("booking_addons").select("*").eq("booking_id", booking.id),
    ]);
  if (!dog || !cust) notFound();
  const coverage = summarizeCoverage((vaxRows ?? []) as DogVaccination[]);

  const washes = (addonRows ?? []) as BookingAddon[];
  const paidWash = washes.some(
    (a) => a.kind === "dog_wash" && a.payment_status === "paid",
  );
  const canAddWash = !paidWash && booking.status !== "canceled";

  const isPaid = booking.payment_status === "paid";
  const isCheckedIn = !!ci?.checked_in_at && !ci?.checked_out_at;
  const isCheckedOut = !!ci?.checked_out_at;

  return (
    <div className="space-y-6 animate-fade-up">
      <ToastNotifier toasts={TOASTS} />
      <Link
        href="/kiosk"
        className="text-sm font-medium text-ink-700 hover:text-ink-900 hover:underline"
      >
        ← Back to today
      </Link>

      <div className="overflow-hidden rounded-3xl border border-stone-200/80 bg-white shadow-soft">
        <div className="flex flex-wrap items-center gap-5 p-6">
          <DogAvatar photoPath={dog.photo_path} name={dog.name} size={120} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-4xl font-bold text-ink-900">
              {dog.name}
            </h1>
            <p className="mt-1 text-ink-700">
              {cust.full_name || cust.email}
              {cust.phone && (
                <span className="ml-2 text-ink-500">· {cust.phone}</span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="pill-neutral">
                {booking.payment_kind === "package" ? "Package" : "Drop-in"}
              </span>
              <span className="pill-neutral">{booking.status}</span>
              <span
                className={
                  booking.payment_status === "paid"
                    ? "pill-success"
                    : booking.payment_status === "unpaid"
                      ? "pill-warn"
                      : "pill-neutral"
                }
              >
                {booking.payment_status}
              </span>
              {paidWash && <span className="pill-success">Dog wash ✓</span>}
            </div>
            {(booking.drop_off_time || booking.pickup_time) && (
              <p className="mt-2 text-sm text-ink-500">
                {booking.drop_off_time && (
                  <>Scheduled drop-off {formatTime(booking.drop_off_time)}</>
                )}
                {booking.drop_off_time && booking.pickup_time && " · "}
                {booking.pickup_time && (
                  <>pickup {formatTime(booking.pickup_time)}</>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 border-t border-stone-200/80 bg-cream-50 p-6 sm:grid-cols-2">
          <Field label="Vaccinations">
            <ul className="space-y-1">
              {coverage.map((c) => {
                const meta = REQUIRED_VACCINES.find(
                  (v) => v.key === c.vaccineType,
                )!;
                return (
                  <li
                    key={c.vaccineType}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-ink-700">{meta.label}</span>
                    <VaccineStatus coverage={c} />
                  </li>
                );
              })}
            </ul>
          </Field>
          <Field label="Allergies">
            {dog.allergies || <em className="text-ink-400">None noted</em>}
          </Field>
          <Field label="Medications">
            {dog.medications || <em className="text-ink-400">None</em>}
          </Field>
          <Field label="Feeding">
            {dog.feeding_notes || <em className="text-ink-400">None</em>}
          </Field>
          <Field label="Behavior">
            {dog.behavior_notes || <em className="text-ink-400">None noted</em>}
          </Field>
          <Field label="Emergency contact">
            {cust.emergency_contact_name ? (
              <>
                {cust.emergency_contact_name}
                {cust.emergency_contact_phone && (
                  <span className="ml-1 text-ink-500">
                    · {cust.emergency_contact_phone}
                  </span>
                )}
              </>
            ) : (
              <em className="text-ink-400">None on file</em>
            )}
          </Field>
        </div>
      </div>

      <ActionPanel
        booking={booking}
        isPaid={isPaid}
        isCheckedIn={isCheckedIn}
        isCheckedOut={isCheckedOut}
        ci={ci ?? null}
      />

      {canAddWash && (
        <form action={kioskAddDogWash}>
          <input type="hidden" name="booking_id" value={booking.id} />
          <button
            type="submit"
            className="w-full rounded-2xl border border-stone-200/80 bg-white px-6 py-4 font-display text-lg font-semibold text-ink-900 shadow-soft transition-all hover:bg-cream-50 active:translate-y-px"
          >
            + Add dog wash · {formatMoney(DOG_WASH_PRICE_CENTS)}
          </button>
        </form>
      )}

      {booking.status !== "canceled" && booking.status !== "checked_out" && (
        <EditStay booking={booking} />
      )}
    </div>
  );
}

function EditStay({ booking }: { booking: Booking }) {
  const isBoarding = booking.service_kind === "boarding";
  const nights = nightCount(booking.service_date, booking.service_end_date);
  const isPaid = booking.payment_status === "paid";
  return (
    <details className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-soft">
      <summary className="cursor-pointer list-none px-6 py-4 font-display text-lg font-semibold text-ink-900 hover:bg-cream-50">
        Edit stay
      </summary>
      <form
        action={kioskUpdateStay}
        className="space-y-4 border-t border-stone-200/80 p-6"
      >
        <input type="hidden" name="booking_id" value={booking.id} />
        {isBoarding ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Check-in</span>
              <input
                type="date"
                name="service_date"
                defaultValue={booking.service_date}
                className="input"
                required
              />
            </label>
            <label className="block">
              <span className="label">Check-out</span>
              <input
                type="date"
                name="service_end_date"
                defaultValue={booking.service_end_date}
                className="input"
                required
              />
            </label>
          </div>
        ) : (
          <label className="block">
            <span className="label">Date</span>
            <input
              type="date"
              name="service_date"
              defaultValue={booking.service_date}
              className="input"
              required
            />
          </label>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Drop-off time</span>
            <input
              type="time"
              name="drop_off_time"
              min={EARLIEST_TIME}
              max={LATEST_TIME}
              step={900}
              defaultValue={hhmm(booking.drop_off_time, DEFAULT_DROP_OFF_TIME)}
              className="input"
              required
            />
          </label>
          <label className="block">
            <span className="label">Pickup time</span>
            <input
              type="time"
              name="pickup_time"
              min={EARLIEST_TIME}
              max={LATEST_TIME}
              step={900}
              defaultValue={hhmm(booking.pickup_time, DEFAULT_PICKUP_TIME)}
              className="input"
              required
            />
          </label>
        </div>
        {isBoarding && (
          <p className="text-xs text-ink-500">
            Currently {nights} night{nights === 1 ? "" : "s"} ·{" "}
            {formatMoney((booking.unit_price_cents ?? 0) * Math.max(1, nights))}{" "}
            at the saved nightly rate. Changing the dates re-prices an unpaid
            stay automatically.
          </p>
        )}
        {isPaid && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This stay is already paid. Changing the dates won&apos;t adjust what
            was charged — collect or refund the difference manually if the night
            count changes.
          </p>
        )}
        <button type="submit" className="btn-primary w-full">
          Save changes
        </button>
      </form>
    </details>
  );
}

function VaccineStatus({ coverage }: { coverage: VaccineCoverage }) {
  switch (coverage.status) {
    case "verified":
      return (
        <span className="text-xs font-medium text-emerald-700">
          ✓ {formatDateShort(coverage.expiresOn!)}
        </span>
      );
    case "pending":
      return <span className="text-xs font-medium text-amber-700">Pending review</span>;
    case "expired":
      return (
        <span className="text-xs font-medium text-red-700">
          Expired {formatDateShort(coverage.expiresOn!)}
        </span>
      );
    case "rejected":
      return <span className="text-xs font-medium text-red-700">Rejected</span>;
    default:
      return <span className="text-xs font-medium text-ink-400">Missing</span>;
  }
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <div className="mt-1 text-sm text-ink-900">{children}</div>
    </div>
  );
}

async function ActionPanel({
  booking,
  isPaid,
  isCheckedIn,
  isCheckedOut,
  ci,
}: {
  booking: Booking;
  isPaid: boolean;
  isCheckedIn: boolean;
  isCheckedOut: boolean;
  ci: CheckIn | null;
}) {
  if (!isPaid) {
    return (
      <form action={kioskTakePayment}>
        <input type="hidden" name="booking_id" value={booking.id} />
        <BigButton tone="red">
          Take payment{" "}
          {booking.unit_price_cents
            ? `· ${formatMoney(booking.unit_price_cents)}`
            : ""}
        </BigButton>
      </form>
    );
  }
  if (isCheckedOut) {
    return (
      <div className="rounded-2xl border border-stone-200/80 bg-cream-100 p-6 text-center text-ink-700 shadow-soft">
        <p className="font-display text-xl font-semibold">Already checked out</p>
        <p className="mt-1 text-sm">
          {ci?.checked_out_at &&
            `at ${new Date(ci.checked_out_at).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}`}
        </p>
      </div>
    );
  }
  if (isCheckedIn) {
    return (
      <form action={kioskCheckOut}>
        <input type="hidden" name="booking_id" value={booking.id} />
        <BigButton tone="emerald">Check out</BigButton>
      </form>
    );
  }
  return (
    <form action={kioskCheckIn}>
      <input type="hidden" name="booking_id" value={booking.id} />
      <BigButton tone="amber">Check in</BigButton>
    </form>
  );
}

function BigButton({
  tone,
  children,
}: {
  tone: "amber" | "emerald" | "red";
  children: React.ReactNode;
}) {
  const toneStyles: Record<typeof tone, string> = {
    amber: "bg-amber-500 hover:bg-amber-600",
    emerald: "bg-emerald-600 hover:bg-emerald-700",
    red: "bg-red-600 hover:bg-red-700",
  };
  return (
    <button
      type="submit"
      className={`w-full rounded-3xl px-6 py-6 font-display text-2xl font-bold text-white shadow-soft transition-all hover:shadow-lift active:translate-y-px ${toneStyles[tone]}`}
    >
      {children}
    </button>
  );
}


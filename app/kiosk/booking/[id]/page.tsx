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
import { settleUnpaidBookings } from "@/lib/coupons.server";
import { getBelongings, lastStayBelongings } from "@/lib/belongings.server";
import { createServiceClient } from "@/lib/supabase/server";
import { DogAvatar } from "@/components/DogAvatar";
import { ToastNotifier } from "@/components/ToastNotifier";
import type {
  Belonging,
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
  kioskCheckOutGroup,
  kioskPayGroup,
  kioskRemoveAddon,
  kioskTakePayment,
  kioskUpdateStay,
} from "../../actions";
import { QUICK_ADD_BELONGINGS } from "@/lib/belongings.server";
import { BelongingsManager } from "./BelongingsManager";

const TOASTS = [
  { param: "paid", message: "Payment received." },
  { param: "canceled", tone: "info" as const, message: "Payment canceled." },
  { param: "updated", message: "Stay updated." },
  {
    param: "charge_removed",
    tone: "info" as const,
    message: "Charge removed.",
  },
  { param: "error", tone: "error" as const },
];

const ADDON_LABELS: Record<string, string> = { dog_wash: "Dog wash" };
const addonLabel = (kind: string) => ADDON_LABELS[kind] ?? kind;

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

// Billable units for a stay: nights for boarding, a single day for daycare.
// Mirrors createBookingCheckoutSession so the displayed total matches what
// Stripe will actually collect.
function stayUnits(b: Booking): number {
  return b.service_kind === "boarding"
    ? Math.max(1, nightCount(b.service_date, b.service_end_date))
    : 1;
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

  // Belongings checklist. When the list is empty, offer to prefill from the
  // dog's last visit so a regular's usual items don't have to be re-typed.
  const svc = createServiceClient();
  const belongings = await getBelongings(svc, booking.id);
  const prefillItems =
    belongings.length === 0
      ? await lastStayBelongings(svc, {
          dogId: booking.dog_id,
          excludeBookingId: booking.id,
        })
      : [];
  const belongingsOutstanding = belongings.filter((b) => !b.returned_at).length;

  const washes = (addonRows ?? []) as BookingAddon[];
  const paidWash = washes.some(
    (a) => a.kind === "dog_wash" && a.payment_status === "paid",
  );
  const pendingWash = washes.some(
    (a) => a.kind === "dog_wash" && a.payment_status === "unpaid",
  );
  const hasWash = paidWash || pendingWash;
  const canAddWash = !hasWash && booking.status !== "canceled";

  const isPaid = booking.payment_status === "paid";
  const isCheckedIn = !!ci?.checked_in_at && !ci?.checked_out_at;
  const isCheckedOut = !!ci?.checked_out_at;

  // Group pickup: every dog this customer currently has on site. When there's
  // more than one, offer a combined pay/check-out so the whole pickup is one tap.
  const { data: siblingRows } = await supabase
    .from("bookings")
    .select("*")
    .eq("customer_id", booking.customer_id)
    .eq("status", "checked_in");
  const siblings = (siblingRows ?? []) as Booking[];
  const groupSize = siblings.length;
  // Settle the unpaid stays against the customer's credit pool — coupon OR
  // credit, never both — the same way kioskPayGroup charges, so they agree.
  const unpaidSiblings = siblings
    .filter((b) => b.payment_status !== "paid")
    .sort((a, b) => a.service_date.localeCompare(b.service_date));
  let groupUnpaidCents = settleUnpaidBookings(
    unpaidSiblings,
    cust.account_credit_cents ?? 0,
  ).reduce((sum, s) => sum + s.chargeAfter, 0);
  if (groupSize > 1) {
    const { data: sibAddons } = await supabase
      .from("booking_addons")
      .select("amount_cents")
      .in("booking_id", siblings.map((b) => b.id))
      .eq("payment_status", "unpaid");
    groupUnpaidCents += ((sibAddons ?? []) as { amount_cents: number }[]).reduce(
      (s, a) => s + a.amount_cents,
      0,
    );
  }

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
              {!paidWash && pendingWash && (
                <span className="pill-warn">Dog wash · unpaid</span>
              )}
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
            {dog.medication_schedule && dog.medication_schedule.length > 0 ? (
              <ul className="space-y-1">
                {dog.medication_schedule.map((m, i) => (
                  <li key={i}>
                    <span className="font-medium text-ink-900">
                      {formatTime(m.time) || "—"}
                    </span>{" "}
                    {m.name}
                    {m.dose ? ` · ${m.dose}` : ""}
                  </li>
                ))}
                {dog.medications && (
                  <li className="text-ink-500">{dog.medications}</li>
                )}
              </ul>
            ) : (
              dog.medications || <em className="text-ink-400">None</em>
            )}
          </Field>
          <Field label="Feeding">
            {dog.feeding_schedule && dog.feeding_schedule.length > 0 ? (
              <ul className="space-y-1">
                {dog.feeding_schedule.map((f, i) => (
                  <li key={i}>
                    <span className="font-medium text-ink-900">
                      {formatTime(f.time) || "—"}
                    </span>{" "}
                    {f.amount}
                  </li>
                ))}
                {dog.feeding_notes && (
                  <li className="text-ink-500">{dog.feeding_notes}</li>
                )}
              </ul>
            ) : (
              dog.feeding_notes || <em className="text-ink-400">None</em>
            )}
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
        belongingsOutstanding={belongingsOutstanding}
      />

      {groupSize > 1 && (
        <GroupPickup
          customerId={booking.customer_id}
          customerName={cust.full_name || cust.email}
          groupSize={groupSize}
          unpaidCents={groupUnpaidCents}
        />
      )}

      <Belongings
        booking={booking}
        items={belongings}
        prefillItems={prefillItems}
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

      <Charges booking={booking} washes={washes} />

      {booking.status !== "canceled" && booking.status !== "checked_out" && (
        <EditStay booking={booking} />
      )}
    </div>
  );
}

function GroupPickup({
  customerId,
  customerName,
  groupSize,
  unpaidCents,
}: {
  customerId: string;
  customerName: string;
  groupSize: number;
  unpaidCents: number;
}) {
  const allWord = groupSize === 2 ? "both" : `all ${groupSize}`;
  return (
    <section className="rounded-2xl border border-stone-200/80 bg-cream-50 p-5 shadow-soft">
      <p className="font-display text-lg font-semibold text-ink-900">
        {customerName} · {groupSize} dogs on site
      </p>
      <p className="mt-1 text-sm text-ink-500">
        Handle the whole pickup at once.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {unpaidCents > 0 && (
          <div className="space-y-2">
            <form action={kioskPayGroup}>
              <input type="hidden" name="customer_id" value={customerId} />
              <button
                type="submit"
                className="w-full rounded-xl bg-red-600 px-5 py-4 font-display text-lg font-semibold text-white shadow-soft transition-all hover:bg-red-700 active:translate-y-px"
              >
                Pay {allWord} · {formatMoney(unpaidCents)}
              </button>
            </form>
            <form action={kioskPayGroup}>
              <input type="hidden" name="customer_id" value={customerId} />
              <input type="hidden" name="via" value="qr" />
              <button
                type="submit"
                className="w-full rounded-xl border border-stone-200/80 bg-white px-5 py-3 font-display text-base font-semibold text-ink-900 shadow-soft transition-all hover:bg-cream-50 active:translate-y-px"
              >
                📱 Pay by phone (QR)
              </button>
            </form>
          </div>
        )}
        <form action={kioskCheckOutGroup}>
          <input type="hidden" name="customer_id" value={customerId} />
          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-600 px-5 py-4 font-display text-lg font-semibold text-white shadow-soft transition-all hover:bg-emerald-700 active:translate-y-px"
          >
            Check out {allWord}
          </button>
        </form>
      </div>
    </section>
  );
}

function Charges({
  booking,
  washes,
}: {
  booking: Booking;
  washes: BookingAddon[];
}) {
  const isBoarding = booking.service_kind === "boarding";
  const units = stayUnits(booking);
  const isPackage = booking.payment_kind === "package";
  const stayLabel = isPackage
    ? "Day care (package day)"
    : isBoarding
      ? `Boarding × ${units} night${units === 1 ? "" : "s"}`
      : "Day care drop-in";
  const stayAmount = isPackage ? 0 : (booking.unit_price_cents ?? 0) * units;

  // Live charges only — refunded/failed add-ons aren't actionable here.
  const items = washes.filter(
    (a) => a.payment_status === "unpaid" || a.payment_status === "paid",
  );
  const canRemove = booking.status !== "canceled";

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-soft">
      <h2 className="px-6 pt-5 font-display text-lg font-semibold text-ink-900">
        Charges
      </h2>
      <ul className="mt-3 divide-y divide-stone-200/80">
        <li className="flex items-center justify-between gap-3 px-6 py-3">
          <div className="min-w-0">
            <p className="font-medium text-ink-900">{stayLabel}</p>
            <p className="text-xs text-ink-500">{booking.payment_status}</p>
          </div>
          <span className="shrink-0 font-semibold text-ink-900">
            {isPackage ? "—" : formatMoney(stayAmount)}
          </span>
        </li>
        {items.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-3 px-6 py-3"
          >
            <div className="min-w-0">
              <p className="font-medium text-ink-900">{addonLabel(a.kind)}</p>
              <p className="text-xs text-ink-500">{a.payment_status}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="font-semibold text-ink-900">
                {formatMoney(a.amount_cents)}
              </span>
              {canRemove && (
                <form action={kioskRemoveAddon}>
                  <input type="hidden" name="addon_id" value={a.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
                  >
                    {a.payment_status === "paid" ? "Remove · refund" : "Remove"}
                  </button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Belongings({
  booking,
  items,
  prefillItems,
}: {
  booking: Booking;
  items: Belonging[];
  prefillItems: { label: string; quantity: number }[];
}) {
  const canEdit =
    booking.status !== "canceled" && booking.status !== "checked_out";
  const outstanding = items.filter((b) => !b.returned_at);

  return (
    <section
      id="belongings"
      className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-soft scroll-mt-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink-900">
          Belongings
        </h2>
        {items.length > 0 && (
          <span className="text-sm text-ink-500">
            {outstanding.length > 0
              ? `${outstanding.length} to return`
              : "All returned ✓"}
          </span>
        )}
      </div>

      <div className="mt-3">
        <BelongingsManager
          bookingId={booking.id}
          initialItems={items}
          prefillItems={prefillItems}
          quickAdd={[...QUICK_ADD_BELONGINGS]}
          canEdit={canEdit}
          showReturns
        />
      </div>
    </section>
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
  belongingsOutstanding,
}: {
  booking: Booking;
  isPaid: boolean;
  isCheckedIn: boolean;
  isCheckedOut: boolean;
  ci: CheckIn | null;
  belongingsOutstanding: number;
}) {
  if (!isPaid) {
    const amount = booking.unit_price_cents
      ? `· ${formatMoney(Math.max(0, booking.unit_price_cents * stayUnits(booking) - (booking.coupon_discount_cents ?? 0)))}`
      : "";
    return (
      <div className="space-y-3">
        <form action={kioskTakePayment}>
          <input type="hidden" name="booking_id" value={booking.id} />
          <BigButton tone="red">Take payment {amount}</BigButton>
        </form>
        <form action={kioskTakePayment}>
          <input type="hidden" name="booking_id" value={booking.id} />
          <input type="hidden" name="via" value="qr" />
          <button
            type="submit"
            className="w-full rounded-2xl border border-stone-200/80 bg-white px-6 py-4 font-display text-lg font-semibold text-ink-900 shadow-soft transition-all hover:bg-cream-50 active:translate-y-px"
          >
            📱 Pay by phone (QR)
          </button>
        </form>
      </div>
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
      <div className="space-y-3">
        {belongingsOutstanding > 0 && (
          <a
            href="#belongings"
            className="block rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-center font-semibold text-amber-900 transition-colors hover:bg-amber-100"
          >
            🧳 {belongingsOutstanding} belonging
            {belongingsOutstanding === 1 ? "" : "s"} still here — send{" "}
            {belongingsOutstanding === 1 ? "it" : "them"} home before checkout
          </a>
        )}
        <form action={kioskCheckOut}>
          <input type="hidden" name="booking_id" value={booking.id} />
          <BigButton tone="emerald">Check out</BigButton>
        </form>
      </div>
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


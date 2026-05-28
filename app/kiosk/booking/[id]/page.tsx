import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateShort, formatMoney } from "@/lib/format";
import { formatTime } from "@/lib/hours";
import { DogAvatar } from "@/components/DogAvatar";
import type {
  AuthorizedPickup,
  Booking,
  BookingBelonging,
  CheckIn,
  Dog,
  DogLogEntry,
  DogVaccination,
  Profile,
} from "@/lib/supabase/types";
import {
  REQUIRED_VACCINES,
  summarizeCoverage,
  type VaccineCoverage,
} from "@/lib/vaccines";
import { DOG_LOG_EMOJI, DOG_LOG_KINDS, DOG_LOG_LABEL } from "@/lib/dogLog";
import { addDogLogEntry } from "@/app/staff/actions";
import {
  addBelonging,
  deleteBelonging,
  markBelongingIn,
  markBelongingOut,
} from "@/app/staff/belongings/actions";
import {
  kioskCheckIn,
  kioskCheckOut,
  kioskMarkReady,
  kioskTakePayment,
} from "../../actions";

export const dynamic = "force-dynamic";

export default async function KioskBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle<Booking>();
  if (!booking) notFound();

  const [
    { data: dog },
    { data: cust },
    { data: ci },
    { data: vaxRows },
    { data: belongingsRows },
    { data: logRows },
    { data: pickupRows },
  ] = await Promise.all([
    supabase.from("dogs").select("*").eq("id", booking.dog_id).maybeSingle<Dog>(),
    supabase.from("profiles").select("*").eq("id", booking.customer_id).maybeSingle<Profile>(),
    supabase.from("check_ins").select("*").eq("booking_id", booking.id).maybeSingle<CheckIn>(),
    supabase.from("dog_vaccinations").select("*").eq("dog_id", booking.dog_id),
    supabase
      .from("booking_belongings")
      .select("*")
      .eq("booking_id", booking.id)
      .order("created_at"),
    supabase
      .from("dog_log_entries")
      .select("*")
      .eq("dog_id", booking.dog_id)
      .order("given_at", { ascending: false })
      .limit(10),
    supabase
      .from("authorized_pickups")
      .select("*")
      .eq("customer_id", booking.customer_id)
      .eq("active", true)
      .order("created_at"),
  ]);
  if (!dog || !cust) notFound();
  const coverage = summarizeCoverage((vaxRows ?? []) as DogVaccination[]);
  const belongings = (belongingsRows ?? []) as BookingBelonging[];
  const logEntries = (logRows ?? []) as DogLogEntry[];
  const pickups = (pickupRows ?? []) as AuthorizedPickup[];

  const isPaid = booking.payment_status === "paid";
  const isCheckedIn = !!ci?.checked_in_at && !ci?.checked_out_at;
  const isCheckedOut = !!ci?.checked_out_at;

  return (
    <div className="space-y-6">
      <Link href="/kiosk" className="text-sm font-medium text-stone-600 hover:text-stone-900">
        ← Back to today
      </Link>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-5 p-6">
          <DogAvatar photoPath={dog.photo_path} name={dog.name} size={120} />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold text-stone-900">{dog.name}</h1>
            <p className="text-stone-600">
              {cust.full_name || cust.email}
              {cust.phone && <span className="ml-2 text-stone-500">· {cust.phone}</span>}
            </p>
            <p className="mt-1 text-sm text-stone-500">
              {booking.payment_kind === "package" ? "Package day" : "Drop-in"} ·{" "}
              {booking.status} · {booking.payment_status}
            </p>
            {(booking.drop_off_time || booking.pickup_time) && (
              <p className="mt-1 text-sm text-stone-500">
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

        <div className="grid grid-cols-1 gap-4 border-t border-stone-200 bg-stone-50 p-6 sm:grid-cols-2">
          <Field label="Vaccinations">
            <ul className="space-y-0.5">
              {coverage.map((c) => {
                const meta = REQUIRED_VACCINES.find((v) => v.key === c.vaccineType)!;
                return (
                  <li key={c.vaccineType} className="flex items-center justify-between gap-2">
                    <span className="text-stone-700">{meta.label}</span>
                    <VaccineStatus coverage={c} />
                  </li>
                );
              })}
            </ul>
          </Field>
          <Field label="Allergies">{dog.allergies || <em className="text-stone-400">None noted</em>}</Field>
          <Field label="Medications">
            {dog.medications || <em className="text-stone-400">None</em>}
          </Field>
          <Field label="Feeding">
            {dog.feeding_notes || <em className="text-stone-400">None</em>}
          </Field>
          <Field label="Behavior">
            {dog.behavior_notes || <em className="text-stone-400">None noted</em>}
          </Field>
          <Field label="Emergency contact">
            {cust.emergency_contact_name ? (
              <>
                {cust.emergency_contact_name}
                {cust.emergency_contact_phone && (
                  <span className="ml-1 text-stone-500">· {cust.emergency_contact_phone}</span>
                )}
              </>
            ) : (
              <em className="text-stone-400">None on file</em>
            )}
          </Field>
        </div>

        {pickups.length > 0 && (
          <div className="border-t border-stone-200 bg-amber-50/50 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Authorized for pickup
            </p>
            <ul className="mt-1.5 grid grid-cols-1 gap-1 text-sm text-stone-800 sm:grid-cols-2">
              {pickups.map((p) => (
                <li key={p.id}>
                  <strong className="text-stone-900">{p.name}</strong>
                  {p.relation && (
                    <span className="text-stone-500"> · {p.relation}</span>
                  )}
                  {p.phone && (
                    <span className="text-stone-500"> · {p.phone}</span>
                  )}
                  {p.notes && (
                    <span className="block text-xs text-stone-500">{p.notes}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ActionPanel
        booking={booking}
        isPaid={isPaid}
        isCheckedIn={isCheckedIn}
        isCheckedOut={isCheckedOut}
        ci={ci ?? null}
      />

      <BelongingsCard booking={booking} items={belongings} />

      <DogLogCard booking={booking} entries={logEntries} />
    </div>
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
      return <span className="text-xs font-medium text-stone-400">Missing</span>;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <div className="mt-0.5 text-sm text-stone-800">{children}</div>
    </div>
  );
}

function ActionPanel({
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
      <div className="rounded-2xl border border-stone-200 bg-stone-100 p-6 text-center text-stone-700">
        <p className="text-lg font-semibold">Already checked out</p>
        <p className="text-sm">
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
        <form action={kioskCheckOut}>
          <input type="hidden" name="booking_id" value={booking.id} />
          <BigButton tone="emerald">Check out</BigButton>
        </form>
        <form action={kioskMarkReady}>
          <input type="hidden" name="booking_id" value={booking.id} />
          <button
            type="submit"
            className="w-full rounded-2xl border-2 border-amber-500 bg-white px-6 py-3 text-base font-semibold text-amber-700 hover:bg-amber-50"
          >
            Ping owner: ready for pickup
          </button>
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
      className={`w-full rounded-2xl px-6 py-6 text-2xl font-bold text-white shadow-sm transition-colors ${toneStyles[tone]}`}
    >
      {children}
    </button>
  );
}

const SUGGESTED_ITEMS = ["Bed", "Leash", "Food bag", "Medication", "Toy", "Blanket"];

function BelongingsCard({
  booking,
  items,
}: {
  booking: Booking;
  items: BookingBelonging[];
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-stone-900">Belongings</h2>
        <span className="text-xs text-stone-500">
          {items.filter((i) => i.brought_in_at).length}/{items.length || 0} in
        </span>
      </header>

      {items.length === 0 ? (
        <p className="text-sm text-stone-500">No items yet — add what the owner brought.</p>
      ) : (
        <ul className="divide-y divide-stone-200">
          {items.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="font-medium text-stone-900">{b.item}</p>
                {b.notes && (
                  <p className="text-xs text-stone-500">{b.notes}</p>
                )}
                <p className="mt-0.5 text-xs text-stone-500">
                  {b.brought_in_at ? (
                    <>✓ Checked in {new Date(b.brought_in_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</>
                  ) : (
                    "Not yet checked in"
                  )}
                  {b.returned_at && (
                    <> · Returned {new Date(b.returned_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {!b.brought_in_at ? (
                  <form action={markBelongingIn}>
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="booking_id" value={booking.id} />
                    <button
                      type="submit"
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Mark in
                    </button>
                  </form>
                ) : !b.returned_at ? (
                  <form action={markBelongingOut}>
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="booking_id" value={booking.id} />
                    <button
                      type="submit"
                      className="rounded-lg bg-stone-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800"
                    >
                      Mark returned
                    </button>
                  </form>
                ) : (
                  <span className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-500">
                    Done
                  </span>
                )}
                <form action={deleteBelonging}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="booking_id" value={booking.id} />
                  <button
                    type="submit"
                    aria-label="Remove"
                    className="rounded-lg border border-stone-300 px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-50"
                  >
                    ✕
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={addBelonging} className="mt-4 space-y-2 border-t border-stone-200 pt-4">
        <input type="hidden" name="booking_id" value={booking.id} />
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_ITEMS.map((s) => (
            <button
              key={s}
              type="submit"
              name="item"
              value={s}
              className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              + {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <input
            type="text"
            name="item"
            placeholder="Add custom item"
            className="input flex-1 text-sm sm:min-w-[12rem]"
          />
          <input
            type="text"
            name="notes"
            placeholder="Notes (optional)"
            className="input flex-1 text-sm sm:min-w-[12rem]"
          />
          <button type="submit" className="btn-secondary text-sm">
            Add
          </button>
        </div>
      </form>
    </section>
  );
}

function DogLogCard({
  booking,
  entries,
}: {
  booking: Booking;
  entries: DogLogEntry[];
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <header className="mb-3">
        <h2 className="text-lg font-semibold text-stone-900">Care log</h2>
        <p className="text-xs text-stone-500">Meals, meds, potty — owner can see this.</p>
      </header>

      <form action={addDogLogEntry} className="space-y-2">
        <input type="hidden" name="dog_id" value={booking.dog_id} />
        <input type="hidden" name="booking_id" value={booking.id} />
        <div className="flex flex-wrap gap-1.5">
          {DOG_LOG_KINDS.map((k) => (
            <button
              key={k.key}
              type="submit"
              name="kind"
              value={k.key}
              className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              {k.emoji} {k.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          name="detail"
          placeholder="Optional detail (e.g. 'half cup, 8oz water', 'gabapentin 100mg')"
          className="input w-full text-sm"
        />
      </form>

      {entries.length > 0 && (
        <ul className="mt-4 divide-y divide-stone-200 border-t border-stone-200 pt-2">
          {entries.map((e) => (
            <li key={e.id} className="py-2 text-sm">
              <p className="text-stone-900">
                {DOG_LOG_EMOJI[e.kind]} {DOG_LOG_LABEL[e.kind]}
                {e.detail && <span className="text-stone-700"> — {e.detail}</span>}
              </p>
              <p className="text-xs text-stone-500">{formatDate(e.given_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

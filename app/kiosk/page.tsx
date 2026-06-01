import Link from "next/link";
import { Calendar, Plus, UserPlus } from "lucide-react";
import { requireFullStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Booking, CheckIn, Dog, Profile } from "@/lib/supabase/types";
import { todayISO } from "@/lib/format";
import { formatTime } from "@/lib/hours";
import { DogAvatar } from "@/components/DogAvatar";
import { ToastNotifier } from "@/components/ToastNotifier";
import { AutoRefresh } from "./AutoRefresh";

const TOASTS = [
  { param: "paid", message: "Payment received — all set!" },
  {
    param: "canceled",
    tone: "info" as const,
    message: "Checkout canceled.",
  },
];

export const dynamic = "force-dynamic";

export default async function KioskHomePage() {
  await requireFullStaff();
  const supabase = await createClient();
  const today = todayISO();

  // In attendance today: started on/before today AND either still in progress
  // (service_end_date > today) OR a boarding stay checking out exactly today —
  // boarders are physically here on departure morning and need a Check-out
  // button. service_end_date is exclusive for daycare, so daycare correctly
  // drops the day after its single day.
  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("*")
    .lte("service_date", today)
    .or(
      `service_end_date.gt.${today},and(service_kind.eq.boarding,service_end_date.eq.${today})`,
    )
    .neq("status", "canceled")
    .order("drop_off_time", { nullsFirst: true });
  const bookings = (bookingsData ?? []) as Booking[];

  const dogIds = Array.from(new Set(bookings.map((b) => b.dog_id)));
  const custIds = Array.from(new Set(bookings.map((b) => b.customer_id)));
  const bookingIds = bookings.map((b) => b.id);

  const [dogsRes, custsRes, checkInsRes] = await Promise.all([
    dogIds.length
      ? supabase.from("dogs").select("*").in("id", dogIds)
      : Promise.resolve({ data: [] as Dog[] }),
    custIds.length
      ? supabase.from("profiles").select("*").in("id", custIds)
      : Promise.resolve({ data: [] as Profile[] }),
    bookingIds.length
      ? supabase.from("check_ins").select("*").in("booking_id", bookingIds)
      : Promise.resolve({ data: [] as CheckIn[] }),
  ]);
  const dogs = (dogsRes.data ?? []) as Dog[];
  const custs = (custsRes.data ?? []) as Profile[];
  const checkIns = (checkInsRes.data ?? []) as CheckIn[];

  const dogById = new Map(dogs.map((d) => [d.id, d]));
  const custById = new Map(custs.map((c) => [c.id, c]));
  const ciByBooking = new Map(checkIns.map((c) => [c.booking_id, c]));

  type Row = { booking: Booking; dog: Dog | undefined; cust: Profile | undefined; ci: CheckIn | undefined };
  const rows: Row[] = bookings.map((b) => ({
    booking: b,
    dog: dogById.get(b.dog_id),
    cust: custById.get(b.customer_id),
    ci: ciByBooking.get(b.id),
  }));

  // Bucket by physical presence, not payment — payment is due at completion,
  // so boarders (and pay-later daycare) are checked in while still unpaid.
  // "Unpaid" is a collections worklist for dogs that have already left owing.
  const arriving = rows.filter(
    (r) => !r.ci?.checked_in_at && !r.ci?.checked_out_at,
  );
  const here = rows.filter(
    (r) => r.ci?.checked_in_at && !r.ci?.checked_out_at,
  );
  const gone = rows.filter(
    (r) => r.ci?.checked_out_at && r.booking.payment_status === "paid",
  );
  const unpaid = rows.filter(
    (r) => r.ci?.checked_out_at && r.booking.payment_status !== "paid",
  );

  return (
    <div className="space-y-6">
      <AutoRefresh />
      <ToastNotifier toasts={TOASTS} />

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink-900">
            Today
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="pill-warm">{bookings.length} booked</span>
            <span className="pill-success">{here.length} on site</span>
            <span className="pill-neutral">{gone.length} gone</span>
          </div>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-500">
            <span className="kiosk-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Auto-refreshes every 15 s
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/kiosk/availability"
            className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-base font-semibold text-ink-700 shadow-soft hover:bg-cream-50 hover:border-stone-300"
          >
            <Calendar size={18} /> Availability
          </Link>
          <Link
            href="/kiosk/booking/new"
            className="inline-flex items-center gap-2 rounded-xl border border-brand-300 bg-white px-4 py-3 text-base font-semibold text-brand-700 shadow-soft hover:bg-brand-50"
          >
            <Plus size={18} /> New booking
          </Link>
          <Link
            href="/kiosk/walk-in"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-base font-semibold text-white shadow-soft hover:bg-brand-700 hover:shadow-glow active:translate-y-px"
          >
            <UserPlus size={18} /> Walk-in
          </Link>
        </div>
      </div>

      <Section title="Arriving" count={arriving.length} accent="border-amber-300">
        {arriving.length === 0 ? (
          <Empty>No one expected.</Empty>
        ) : (
          <Tiles>
            {arriving.map((r) => (
              <DogTile
                key={r.booking.id}
                row={r}
                cta="Check in"
                tone="amber"
                unpaid={r.booking.payment_status !== "paid"}
              />
            ))}
          </Tiles>
        )}
      </Section>

      <Section title="Here" count={here.length} accent="border-emerald-300">
        {here.length === 0 ? (
          <Empty>No dogs on site yet.</Empty>
        ) : (
          <Tiles>
            {here.map((r) => (
              <DogTile
                key={r.booking.id}
                row={r}
                cta="Check out"
                tone="emerald"
                unpaid={r.booking.payment_status !== "paid"}
              />
            ))}
          </Tiles>
        )}
      </Section>

      {unpaid.length > 0 && (
        <Section title="Unpaid" count={unpaid.length} accent="border-red-300">
          <Tiles>
            {unpaid.map((r) => (
              <DogTile key={r.booking.id} row={r} cta="Take payment" tone="red" />
            ))}
          </Tiles>
        </Section>
      )}

      {gone.length > 0 && (
        <Section title="Gone" count={gone.length} accent="border-stone-300">
          <Tiles>
            {gone.map((r) => (
              <DogTile key={r.booking.id} row={r} cta="View" tone="stone" />
            ))}
          </Tiles>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  accent,
  children,
}: {
  title: string;
  count: number;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-3xl border-l-4 border border-stone-200/80 bg-white p-5 shadow-soft ${accent}`}
    >
      <h2 className="mb-3 flex items-baseline gap-2 font-display text-xl font-semibold text-ink-900">
        {title}{" "}
        <span className="text-sm font-normal text-ink-500">({count})</span>
      </h2>
      {children}
    </section>
  );
}

function Tiles({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-500">{children}</p>;
}

function DogTile({
  row,
  cta,
  tone,
  unpaid,
}: {
  row: {
    booking: {
      id: string;
      drop_off_time: string | null;
      pickup_time: string | null;
    };
    dog: { id: string; name: string; photo_path: string | null } | undefined;
    cust: { full_name: string | null; email: string } | undefined;
  };
  cta: string;
  tone: "amber" | "emerald" | "red" | "stone";
  unpaid?: boolean;
}) {
  const toneStyles: Record<typeof tone, string> = {
    amber: "bg-amber-500 hover:bg-amber-600 shadow-soft",
    emerald: "bg-emerald-600 hover:bg-emerald-700 shadow-soft",
    red: "bg-red-600 hover:bg-red-700 shadow-soft",
    stone: "bg-ink-500 hover:bg-ink-700 shadow-soft",
  };
  const dropOff = row.booking.drop_off_time
    ? formatTime(row.booking.drop_off_time)
    : null;
  const pickup = row.booking.pickup_time
    ? formatTime(row.booking.pickup_time)
    : null;
  return (
    <Link
      href={`/kiosk/booking/${row.booking.id}`}
      className="group flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white p-3 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-lift"
    >
      {row.dog && (
        <DogAvatar
          photoPath={row.dog.photo_path}
          name={row.dog.name}
          size={56}
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-semibold text-ink-900">
          {row.dog?.name ?? "Dog"}
          {unpaid && (
            <span className="ml-2 align-middle pill-warn">unpaid</span>
          )}
        </p>
        <p className="truncate text-sm text-ink-500">
          {row.cust?.full_name || row.cust?.email}
        </p>
        {(dropOff || pickup) && (
          <p className="truncate text-xs text-ink-500">
            {dropOff && <>↓ {dropOff}</>}
            {dropOff && pickup && " · "}
            {pickup && <>↑ {pickup}</>}
          </p>
        )}
      </div>
      <span
        className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-white ${toneStyles[tone]}`}
      >
        {cta}
      </span>
    </Link>
  );
}


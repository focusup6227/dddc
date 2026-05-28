import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Booking, CheckIn, Dog, Profile } from "@/lib/supabase/types";
import { todayISO } from "@/lib/format";
import { formatTime } from "@/lib/hours";
import { DogAvatar } from "@/components/DogAvatar";
import { AutoRefresh } from "./AutoRefresh";

export const dynamic = "force-dynamic";

export default async function KioskHomePage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; canceled?: string }>;
}) {
  await requireStaff();
  const supabase = await createClient();
  const today = todayISO();
  const params = await searchParams;

  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("*")
    .lte("service_date", today)
    .gt("service_end_date", today)
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

  const unpaid = rows.filter((r) => r.booking.payment_status !== "paid");
  const here = rows.filter(
    (r) => r.booking.payment_status === "paid" && r.ci?.checked_in_at && !r.ci.checked_out_at,
  );
  const gone = rows.filter((r) => r.ci?.checked_out_at);
  const arriving = rows.filter(
    (r) =>
      r.booking.payment_status === "paid" && !r.ci?.checked_in_at,
  );

  return (
    <div className="space-y-6">
      <AutoRefresh />
      {params.paid && (
        <Banner kind="success">Payment received — all set!</Banner>
      )}
      {params.canceled && (
        <Banner kind="warning">Checkout canceled.</Banner>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Today</h1>
          <p className="text-stone-600">
            {bookings.length} booked · {here.length} on site · {gone.length} gone
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-stone-500">
            <span className="kiosk-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Auto-refreshes every 15 s
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/kiosk/availability"
            className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-3 text-base font-semibold text-stone-700 hover:bg-stone-50"
          >
            Availability
          </Link>
          <Link
            href="/kiosk/booking/new"
            className="inline-flex items-center gap-2 rounded-xl border border-brand-600 bg-white px-4 py-3 text-base font-semibold text-brand-700 hover:bg-brand-50"
          >
            + New booking
          </Link>
          <Link
            href="/kiosk/walk-in"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            + Walk-in
          </Link>
        </div>
      </div>

      <Section title="Arriving" count={arriving.length} accent="border-amber-300">
        {arriving.length === 0 ? (
          <Empty>No one expected.</Empty>
        ) : (
          <Tiles>
            {arriving.map((r) => (
              <DogTile key={r.booking.id} row={r} cta="Check in" tone="amber" />
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
              <DogTile key={r.booking.id} row={r} cta="Check out" tone="emerald" />
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
    <section className={`rounded-2xl border-l-4 bg-white p-4 shadow-sm ${accent}`}>
      <h2 className="mb-3 flex items-baseline gap-2 text-lg font-semibold text-stone-900">
        {title}{" "}
        <span className="text-sm font-normal text-stone-500">({count})</span>
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
  return <p className="text-sm text-stone-500">{children}</p>;
}

function DogTile({
  row,
  cta,
  tone,
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
}) {
  const toneStyles: Record<typeof tone, string> = {
    amber: "bg-amber-500 hover:bg-amber-600",
    emerald: "bg-emerald-600 hover:bg-emerald-700",
    red: "bg-red-600 hover:bg-red-700",
    stone: "bg-stone-500 hover:bg-stone-600",
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
      className="group flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3 text-left transition-colors hover:border-stone-300 hover:bg-stone-50"
    >
      {row.dog && <DogAvatar photoPath={row.dog.photo_path} name={row.dog.name} size={56} />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-stone-900">
          {row.dog?.name ?? "Dog"}
        </p>
        <p className="truncate text-sm text-stone-500">
          {row.cust?.full_name || row.cust?.email}
        </p>
        {(dropOff || pickup) && (
          <p className="truncate text-xs text-stone-500">
            {dropOff && <>↓ {dropOff}</>}
            {dropOff && pickup && " · "}
            {pickup && <>↑ {pickup}</>}
          </p>
        )}
      </div>
      <span
        className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-white ${toneStyles[tone]}`}
      >
        {cta}
      </span>
    </Link>
  );
}

function Banner({
  kind,
  children,
}: {
  kind: "success" | "warning";
  children: React.ReactNode;
}) {
  const style =
    kind === "success"
      ? "bg-emerald-50 text-emerald-900 border-emerald-200"
      : "bg-amber-50 text-amber-900 border-amber-200";
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${style}`}>
      {children}
    </div>
  );
}

import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Blackout,
  Booking,
  Dog,
  Event,
  Profile,
} from "@/lib/supabase/types";
import { todayISO } from "@/lib/format";
import { getEventsInRange, indexEventsByDate } from "@/lib/events.server";
import { getBlackoutsInRange, indexBlackoutsByDate } from "@/lib/blackouts.server";
import { StaffSubNav } from "@/components/StaffSubNav";
import { CalendarClient } from "./CalendarClient";

const SUBNAV = [
  { href: "/staff/calendar", label: "Calendar", active: true },
  { href: "/staff/bookings", label: "All bookings" },
];

export const dynamic = "force-dynamic";

export default async function StaffCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; error?: string; date?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const monthAnchor = normalizeMonth(params.month) ?? firstOfMonth(todayISO());
  const grid = monthGrid(monthAnchor);
  const monthKey = monthAnchor.slice(0, 7);

  const supabase = await createClient();
  const [bookingsRes, events, blackouts] = await Promise.all([
    supabase
      .from("bookings")
      .select("*")
      .gte("service_date", grid.gridStart)
      .lte("service_date", grid.gridEnd)
      .neq("status", "canceled")
      .order("service_date"),
    getEventsInRange(grid.gridStart, grid.gridEnd),
    getBlackoutsInRange(grid.gridStart, grid.gridEnd),
  ]);
  const bookings = (bookingsRes.data ?? []) as Booking[];

  const dogIds = Array.from(new Set(bookings.map((b) => b.dog_id)));
  const custIds = Array.from(new Set(bookings.map((b) => b.customer_id)));
  const [dogsRes, custsRes] = await Promise.all([
    dogIds.length
      ? supabase.from("dogs").select("*").in("id", dogIds)
      : Promise.resolve({ data: [] as Dog[] }),
    custIds.length
      ? supabase.from("profiles").select("*").in("id", custIds)
      : Promise.resolve({ data: [] as Profile[] }),
  ]);
  const dogs = (dogsRes.data ?? []) as Dog[];
  const custs = (custsRes.data ?? []) as Profile[];

  const bookingsByDate = new Map<string, Booking[]>();
  for (const b of bookings) {
    const arr = bookingsByDate.get(b.service_date) ?? [];
    arr.push(b);
    bookingsByDate.set(b.service_date, arr);
  }
  const eventsByDate = indexEventsByDate(events, grid.gridStart, grid.gridEnd);
  const blackoutsByDate = indexBlackoutsByDate(
    blackouts,
    grid.gridStart,
    grid.gridEnd,
  );

  const monthLabel = new Date(
    Number(monthAnchor.slice(0, 4)),
    Number(monthAnchor.slice(5, 7)) - 1,
    1,
  ).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const prevMonth = shiftMonth(monthAnchor, -1).slice(0, 7);
  const nextMonth = shiftMonth(monthAnchor, 1).slice(0, 7);
  const thisMonth = todayISO().slice(0, 7);

  return (
    <div className="space-y-6">
      <StaffSubNav items={SUBNAV} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Calendar</h1>
          <p className="text-stone-600">
            Bookings, events, and blackouts. Tap a day to edit.
          </p>
        </div>
      </header>

      {params.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
          {params.error}
        </p>
      )}

      <CalendarClient
        monthAnchor={monthAnchor}
        monthLabel={monthLabel}
        prevMonthHref={`/staff/calendar?month=${prevMonth}`}
        nextMonthHref={`/staff/calendar?month=${nextMonth}`}
        todayHref={`/staff/calendar?month=${thisMonth}`}
        today={todayISO()}
        days={grid.days}
        bookingsByDate={serializeBookings(bookingsByDate)}
        eventsByDate={serializeEventsByDate(eventsByDate)}
        blackoutsByDate={serializeBlackoutsByDate(blackoutsByDate)}
        events={events}
        blackouts={blackouts}
        dogsById={Object.fromEntries(
          dogs.map((d) => [d.id, { id: d.id, name: d.name }]),
        )}
        custsById={Object.fromEntries(
          custs.map((c) => [
            c.id,
            {
              id: c.id,
              full_name: c.full_name,
              email: c.email,
            },
          ]),
        )}
        initialDate={params.date ?? null}
        monthKey={monthKey}
      />
    </div>
  );
}

type SerializedBooking = {
  id: string;
  dog_id: string;
  customer_id: string;
  service_kind: string;
  status: string;
  payment_status: string;
};

function serializeBookings(
  m: Map<string, Booking[]>,
): Record<string, SerializedBooking[]> {
  const out: Record<string, SerializedBooking[]> = {};
  for (const [k, v] of m) {
    out[k] = v.map((b) => ({
      id: b.id,
      dog_id: b.dog_id,
      customer_id: b.customer_id,
      service_kind: b.service_kind,
      status: b.status,
      payment_status: b.payment_status,
    }));
  }
  return out;
}

function serializeEventsByDate(
  m: Map<string, Event[]>,
): Record<string, Event[]> {
  return Object.fromEntries(m);
}

function serializeBlackoutsByDate(
  m: Map<string, Blackout[]>,
): Record<string, Blackout[]> {
  return Object.fromEntries(m);
}

function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function normalizeMonth(input: string | undefined): string | null {
  if (!input) return null;
  const m = input.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-01`;
}

function shiftMonth(monthAnchor: string, delta: number): string {
  const y = Number(monthAnchor.slice(0, 4));
  const m = Number(monthAnchor.slice(5, 7));
  const d = new Date(y, m - 1 + delta, 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}-01`;
}

function monthGrid(monthAnchor: string) {
  const y = Number(monthAnchor.slice(0, 4));
  const m = Number(monthAnchor.slice(5, 7));
  const first = new Date(y, m - 1, 1);
  const startOffset = first.getDay();
  const gridStartDate = new Date(y, m - 1, 1 - startOffset);
  const days: { iso: string; day: number; month: string }[] = [];
  for (let i = 0; i < 42; i++) {
    const cur = new Date(
      gridStartDate.getFullYear(),
      gridStartDate.getMonth(),
      gridStartDate.getDate() + i,
    );
    const yy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, "0");
    const dd = String(cur.getDate()).padStart(2, "0");
    days.push({
      iso: `${yy}-${mm}-${dd}`,
      day: cur.getDate(),
      month: `${yy}-${mm}`,
    });
  }
  return {
    days,
    gridStart: days[0].iso,
    gridEnd: days[days.length - 1].iso,
  };
}

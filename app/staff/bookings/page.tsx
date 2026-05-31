import Link from "next/link";
import { isJuniorStaff, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Booking,
  BookingStatus,
  Dog,
  Event,
  Profile,
} from "@/lib/supabase/types";
import {
  addDays,
  bookingDatesInRange,
  formatDateShort,
  formatMoney,
  todayISO,
} from "@/lib/format";
import { EventList } from "@/components/EventList";
import { getEventsInRange, indexEventsByDate } from "@/lib/events.server";
import { StaffSubNav } from "@/components/StaffSubNav";
import StaffCancelButton from "./StaffCancelButton";

const SUBNAV = [
  { href: "/staff/calendar", label: "Calendar" },
  { href: "/staff/bookings", label: "All bookings", active: true },
];

type View = "list" | "calendar";

export default async function StaffBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    from?: string;
    to?: string;
    month?: string;
  }>;
}) {
  const session = await requireStaff();
  const isJunior = isJuniorStaff(session.profile);
  const supabase = await createClient();
  const params = await searchParams;
  const view: View = params.view === "calendar" ? "calendar" : "list";

  // Determine the date range to fetch based on view.
  let from: string;
  let to: string;
  let monthAnchor: string; // YYYY-MM-01 used by calendar grid
  if (view === "calendar") {
    monthAnchor = normalizeMonth(params.month) ?? firstOfMonth(todayISO());
    const grid = monthGrid(monthAnchor);
    from = grid.gridStart;
    to = grid.gridEnd;
  } else {
    from = params.from ?? todayISO();
    to = params.to ?? addDays(from, 30);
    monthAnchor = firstOfMonth(from);
  }

  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("*")
    // Overlap test: include multi-day boarding stays that span into this range
    // even if they began before it.
    .lte("service_date", to)
    .gte("service_end_date", from)
    .neq("status", "canceled")
    .order("service_date");
  const bookings = (bookingsData ?? []) as Booking[];

  const dogIds = Array.from(new Set(bookings.map((b) => b.dog_id)));
  const custIds = Array.from(new Set(bookings.map((b) => b.customer_id)));

  const [dogsRes, custsRes] = await Promise.all([
    dogIds.length
      ? supabase.from("dogs").select("*").in("id", dogIds)
      : Promise.resolve({ data: [] }),
    custIds.length
      ? supabase.from("profiles").select("*").in("id", custIds)
      : Promise.resolve({ data: [] }),
  ]);
  const dogs = (dogsRes.data ?? []) as Dog[];
  const custs = (custsRes.data ?? []) as Profile[];

  const dogById = new Map(dogs.map((d) => [d.id, d]));

  const events = await getEventsInRange(from, to);
  const eventsByDate = indexEventsByDate(events, from, to);

  return (
    <div className="space-y-6 animate-fade-up">
      <StaffSubNav items={SUBNAV} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">
            Bookings
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            All scheduled days and stays.
          </p>
        </div>
        <ViewToggle view={view} monthAnchor={monthAnchor} from={from} to={to} />
      </header>

      {view === "calendar" ? (
        <>
          <CalendarView
            monthAnchor={monthAnchor}
            bookings={bookings}
            dogById={dogById}
            eventsByDate={eventsByDate}
          />
          {events.length > 0 && (
            <EventList events={events} title="Events this month" compact />
          )}
        </>
      ) : (
        <ListView
          from={from}
          to={to}
          bookings={bookings}
          dogs={dogs}
          custs={custs}
          canCancel={!isJunior}
        />
      )}
    </div>
  );
}

function ViewToggle({
  view,
  monthAnchor,
  from,
  to,
}: {
  view: View;
  monthAnchor: string;
  from: string;
  to: string;
}) {
  const listHref = `/staff/bookings?view=list&from=${from}&to=${to}`;
  const calHref = `/staff/bookings?view=calendar&month=${monthAnchor.slice(0, 7)}`;
  const base =
    "px-3 py-1.5 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md";
  const active = "bg-brand-600 text-white";
  const idle = "bg-white text-ink-700 hover:bg-stone-50";
  return (
    <div className="inline-flex rounded-md border border-stone-300">
      <Link href={listHref} className={`${base} ${view === "list" ? active : idle}`}>
        List
      </Link>
      <Link
        href={calHref}
        className={`${base} border-l border-stone-300 ${view === "calendar" ? active : idle}`}
      >
        Calendar
      </Link>
    </div>
  );
}

function ListView({
  from,
  to,
  bookings,
  dogs,
  custs,
  canCancel,
}: {
  from: string;
  to: string;
  bookings: Booking[];
  dogs: Dog[];
  custs: Profile[];
  canCancel: boolean;
}) {
  const byDate = new Map<string, Booking[]>();
  for (const b of bookings) {
    for (const date of bookingDatesInRange(b, from, to)) {
      const arr = byDate.get(date) ?? [];
      arr.push(b);
      byDate.set(date, arr);
    }
  }
  const sortedDates = Array.from(byDate.keys()).sort();

  return (
    <div className="space-y-8">
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="view" value="list" />
        <label className="block">
          <span className="block text-xs text-ink-500">From</span>
          <input type="date" name="from" defaultValue={from} className="input" />
        </label>
        <label className="block">
          <span className="block text-xs text-ink-500">To</span>
          <input type="date" name="to" defaultValue={to} className="input" />
        </label>
        <button type="submit" className="btn-secondary">
          Apply
        </button>
      </form>

      {sortedDates.length === 0 ? (
        <p className="text-ink-700">No bookings in this range.</p>
      ) : (
        sortedDates.map((date) => {
          const dayBookings = byDate.get(date)!;
          return (
            <section key={date}>
              <h2 className="text-lg font-semibold text-ink-900">
                {formatDateShort(date)} · {dayBookings.length} dog
                {dayBookings.length === 1 ? "" : "s"}
              </h2>
              <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
                {dayBookings.map((b) => {
                  const dog = dogs.find((d) => d.id === b.dog_id);
                  const cust = custs.find((c) => c.id === b.customer_id);
                  return (
                    <li
                      key={b.id}
                      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/staff/dogs/${b.dog_id}`}
                          className="font-medium text-ink-900 hover:underline"
                        >
                          {dog?.name ?? "Dog"}
                        </Link>{" "}
                        <span className="text-ink-500">
                          · {cust?.full_name ?? cust?.email}
                        </span>
                        <p className="text-xs text-ink-500">
                          {b.service_kind === "boarding"
                            ? `Boarding ${formatDateShort(b.service_date)}–${formatDateShort(b.service_end_date)}`
                            : b.payment_kind}{" "}
                          · {b.status} · {b.payment_status}
                        </p>
                      </div>
                      {canCancel && b.status === "reserved" && (
                        <StaffCancelButton
                          bookingId={b.id}
                          preview={refundPreviewForStaff(b)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function CalendarView({
  monthAnchor,
  bookings,
  dogById,
  eventsByDate,
}: {
  monthAnchor: string;
  bookings: Booking[];
  dogById: Map<string, Dog>;
  eventsByDate: Map<string, Event[]>;
}) {
  const grid = monthGrid(monthAnchor);
  const today = todayISO();
  const monthLabel = new Date(
    Number(monthAnchor.slice(0, 4)),
    Number(monthAnchor.slice(5, 7)) - 1,
    1,
  ).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const byDate = new Map<string, Booking[]>();
  for (const b of bookings) {
    for (const date of bookingDatesInRange(b, grid.gridStart, grid.gridEnd)) {
      const arr = byDate.get(date) ?? [];
      arr.push(b);
      byDate.set(date, arr);
    }
  }

  const prevMonth = shiftMonth(monthAnchor, -1).slice(0, 7);
  const nextMonth = shiftMonth(monthAnchor, 1).slice(0, 7);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink-900">{monthLabel}</h2>
        <div className="flex gap-2">
          <Link
            href={`/staff/bookings?view=calendar&month=${prevMonth}`}
            className="btn-secondary"
            aria-label="Previous month"
          >
            ←
          </Link>
          <Link
            href={`/staff/bookings?view=calendar&month=${todayISO().slice(0, 7)}`}
            className="btn-secondary"
          >
            Today
          </Link>
          <Link
            href={`/staff/bookings?view=calendar&month=${nextMonth}`}
            className="btn-secondary"
            aria-label="Next month"
          >
            →
          </Link>
        </div>
      </div>

      <Legend />

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-stone-200 bg-stone-200 text-sm">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div
            key={i}
            className="bg-stone-50 px-1 py-1.5 text-center text-xs font-semibold text-ink-700 sm:px-2"
          >
            <span className="sm:hidden">{d}</span>
            <span className="hidden sm:inline">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i]}
            </span>
          </div>
        ))}
        {grid.days.map((d) => {
          const dayBookings = byDate.get(d.iso) ?? [];
          const dayEvents = eventsByDate.get(d.iso) ?? [];
          const isOther = d.month !== monthAnchor.slice(0, 7);
          const isToday = d.iso === today;
          return (
            <Link
              key={d.iso}
              href={`/staff/bookings?view=list&from=${d.iso}&to=${d.iso}`}
              className={
                "flex min-h-[64px] flex-col gap-1 bg-white p-1 hover:bg-brand-50 sm:min-h-[110px] sm:p-1.5 " +
                (isOther ? "opacity-40 " : "")
              }
            >
              <div className="flex items-center justify-between">
                <span
                  className={
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold " +
                    (isToday
                      ? "bg-brand-600 text-white"
                      : "text-ink-700")
                  }
                >
                  {d.day}
                </span>
                <div className="flex items-center gap-1">
                  {dayEvents.length > 0 && (
                    <span
                      aria-label={`${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`}
                      title={dayEvents.map((e) => e.title).join(" · ")}
                      className="inline-block h-2 w-2 rounded-full bg-amber-500"
                    />
                  )}
                  {dayBookings.length > 0 && (
                    <span className="text-xs font-medium text-ink-500">
                      <span className="hidden sm:inline">
                        {dayBookings.length} dog{dayBookings.length === 1 ? "" : "s"}
                      </span>
                      <span className="sm:hidden">{dayBookings.length}</span>
                    </span>
                  )}
                </div>
              </div>
              <ul className="hidden flex-col gap-0.5 text-xs leading-tight sm:flex">
                {dayEvents.slice(0, 1).map((e) => (
                  <li
                    key={`ev-${e.id}`}
                    className="truncate text-amber-700"
                    title={e.title}
                  >
                    ★ {e.title}
                  </li>
                ))}
                {dayBookings.slice(0, dayEvents.length > 0 ? 2 : 3).map((b) => {
                  const dog = dogById.get(b.dog_id);
                  return (
                    <li
                      key={b.id}
                      className="flex items-center gap-1 truncate"
                      title={`${dog?.name ?? "Dog"} · ${b.status}`}
                    >
                      <StatusDot status={b.status} />
                      <span className="truncate text-ink-900">
                        {dog?.name ?? "Dog"}
                      </span>
                    </li>
                  );
                })}
                {dayBookings.length > (dayEvents.length > 0 ? 2 : 3) && (
                  <li className="text-ink-500">
                    +{dayBookings.length - (dayEvents.length > 0 ? 2 : 3)} more
                  </li>
                )}
              </ul>
              {dayBookings.length > 0 && (
                <div className="flex flex-wrap gap-0.5 sm:hidden">
                  {dayBookings.slice(0, 4).map((b) => (
                    <StatusDot key={b.id} status={b.status} />
                  ))}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: BookingStatus }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.reserved;
  return (
    <span
      aria-label={status}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${style.dot}`}
    />
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-700">
      {(["reserved", "checked_in", "checked_out", "no_show"] as BookingStatus[]).map(
        (s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${STATUS_STYLE[s].dot}`} />
            {STATUS_STYLE[s].label}
          </span>
        ),
      )}
    </div>
  );
}

const STATUS_STYLE: Record<BookingStatus, { dot: string; label: string }> = {
  reserved: {
    dot: "bg-stone-300 ring-1 ring-stone-400",
    label: "Scheduled",
  },
  checked_in: {
    dot: "bg-emerald-500",
    label: "Checked in",
  },
  checked_out: {
    dot: "bg-sky-500",
    label: "Checked out",
  },
  no_show: {
    dot: "bg-red-500",
    label: "No-show",
  },
  canceled: {
    dot: "bg-stone-200",
    label: "Canceled",
  },
};

function refundPreviewForStaff(b: Booking): string {
  // Staff cancels always refund the customer in full.
  if (b.payment_kind === "package") {
    return "Full refund: 1 day returned to package.";
  }
  if (b.payment_status !== "paid" || !b.unit_price_cents) {
    return "Unpaid — no refund.";
  }
  const [y1, m1, d1] = b.service_date.split("-").map(Number);
  const [y2, m2, d2] = b.service_end_date.split("-").map(Number);
  const nights = Math.max(
    1,
    Math.round(
      (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000,
    ),
  );
  const amount = b.unit_price_cents * nights;
  return `Full refund: ${formatMoney(amount)}.`;
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
  const startOffset = first.getDay(); // 0=Sun
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

import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Booking,
  CustomerPackage,
  Profile,
} from "@/lib/supabase/types";
import { addDays, formatMoney, todayISO } from "@/lib/format";
import {
  getDayCounts,
  getMaxDogsPerDay,
  getMaxDogsPerNight,
} from "@/lib/settings";
import { StaffSubNav } from "@/components/StaffSubNav";

const SUBNAV = [
  { href: "/staff", label: "Today" },
  { href: "/staff/overview", label: "Numbers", active: true },
];

export const dynamic = "force-dynamic";

export default async function StaffOverviewPage() {
  await requireStaff();
  const supabase = await createClient();
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonth = nextMonthStart(today);

  const [
    bookingsRes,
    packagesRes,
    custsRes,
    activePackagesRes,
    maxDay,
    maxNight,
    daycareCounts,
    boardingCounts,
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("*")
      .gte("service_date", monthStart)
      .lt("service_date", nextMonth),
    supabase
      .from("customer_packages")
      .select("*")
      .gte("created_at", monthStart)
      .lt("created_at", nextMonth),
    supabase.from("profiles").select("*").eq("role", "customer"),
    supabase
      .from("customer_packages")
      .select("*")
      .eq("payment_status", "paid")
      .gt("days_remaining", 0)
      .lte("days_remaining", 2),
    getMaxDogsPerDay(),
    getMaxDogsPerNight(),
    getDayCounts([today, addDays(today, 1)], "daycare"),
    getDayCounts([today, addDays(today, 1)], "boarding"),
  ]);

  const monthBookings = (bookingsRes.data ?? []) as Booking[];
  const monthPackages = (packagesRes.data ?? []) as CustomerPackage[];
  const customers = (custsRes.data ?? []) as Profile[];
  const lowPackages = (activePackagesRes.data ?? []) as CustomerPackage[];

  const custById = new Map(customers.map((c) => [c.id, c]));

  // Revenue: paid drop-in bookings (units × price), boarding charges, and
  // package purchases — minus refunded portions.
  let bookingRevenue = 0;
  let refunds = 0;
  let daycareCount = 0;
  let boardingCount = 0;
  for (const b of monthBookings) {
    if (b.status === "canceled") {
      refunds += b.refund_amount_cents ?? 0;
      continue;
    }
    if (b.service_kind === "daycare") daycareCount += 1;
    else boardingCount += 1;
    if (b.payment_status === "paid" && b.payment_kind === "drop_in" && b.unit_price_cents) {
      const nights = Math.max(1, nightCount(b.service_date, b.service_end_date));
      bookingRevenue += b.unit_price_cents * nights;
    }
    if ((b.refund_amount_cents ?? 0) > 0) {
      refunds += b.refund_amount_cents ?? 0;
    }
  }
  const packageRevenue = monthPackages
    .filter((p) => p.payment_status === "paid")
    .reduce((s, p) => s + p.amount_paid_cents, 0);
  const grossRevenue = bookingRevenue + packageRevenue;
  const netRevenue = grossRevenue - refunds;

  // Top customers in last 90 days by booking count.
  const ninetyAgo = addDays(today, -90);
  const { data: recentBookings } = await supabase
    .from("bookings")
    .select("customer_id, status")
    .gte("service_date", ninetyAgo)
    .neq("status", "canceled");
  const bookingsByCust = new Map<string, number>();
  for (const r of (recentBookings ?? []) as Pick<Booking, "customer_id">[]) {
    bookingsByCust.set(r.customer_id, (bookingsByCust.get(r.customer_id) ?? 0) + 1);
  }
  const topCustomers = Array.from(bookingsByCust.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ profile: custById.get(id), count, id }));

  // New customers this month.
  const newCustomersCount = customers.filter(
    (c) => c.created_at >= monthStart && c.created_at < nextMonth,
  ).length;

  // Today/tomorrow occupancy.
  const daycareToday = daycareCounts.get(today) ?? 0;
  const daycareTomorrow = daycareCounts.get(addDays(today, 1)) ?? 0;
  const boardingToday = boardingCounts.get(today) ?? 0;
  const boardingTomorrow = boardingCounts.get(addDays(today, 1)) ?? 0;

  return (
    <div className="space-y-8 animate-fade-up">
      <StaffSubNav items={SUBNAV} />
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
          {monthLabel(today)}
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold text-ink-900">
          Numbers
        </h1>
        <p className="mt-2 text-ink-500">
          Month-to-date. Refresh anytime — figures update as payments settle.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Net revenue"
          value={formatMoney(netRevenue)}
          hint={`${formatMoney(grossRevenue)} gross − ${formatMoney(refunds)} refunds`}
        />
        <StatCard
          title="Bookings"
          value={String(daycareCount + boardingCount)}
          hint={`${daycareCount} daycare · ${boardingCount} boarding`}
        />
        <StatCard
          title="New customers"
          value={String(newCustomersCount)}
          hint="signed up this month"
        />
        <StatCard
          title="Refunds"
          value={formatMoney(refunds)}
          hint="this month"
        />
      </div>

      <section>
        <h2 className="text-lg font-semibold text-stone-900">Occupancy</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <OccupancyCard
            title="Daycare today"
            count={daycareToday}
            max={maxDay}
          />
          <OccupancyCard
            title="Daycare tomorrow"
            count={daycareTomorrow}
            max={maxDay}
          />
          <OccupancyCard
            title="Boarding tonight"
            count={boardingToday}
            max={maxNight}
          />
          <OccupancyCard
            title="Boarding tomorrow night"
            count={boardingTomorrow}
            max={maxNight}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-lg font-semibold text-stone-900">
            Top customers (last 90 days)
          </h2>
          {topCustomers.length === 0 ? (
            <p className="mt-2 text-stone-600">No bookings in this window.</p>
          ) : (
            <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
              {topCustomers.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <Link
                    href={`/staff/customers/${t.id}`}
                    className="font-medium text-stone-900 hover:underline"
                  >
                    {t.profile?.full_name || t.profile?.email || "—"}
                  </Link>
                  <span className="text-stone-500">
                    {t.count} booking{t.count === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900">
            Low package balances
          </h2>
          <p className="text-xs text-stone-500">
            Customers with 2 days or fewer remaining — nudge them before they
            run out.
          </p>
          {lowPackages.length === 0 ? (
            <p className="mt-2 text-stone-600">Nobody is low right now.</p>
          ) : (
            <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
              {lowPackages.map((p) => {
                const cust = custById.get(p.customer_id);
                return (
                  <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <Link
                      href={`/staff/customers/${p.customer_id}`}
                      className="font-medium text-stone-900 hover:underline"
                    >
                      {cust?.full_name || cust?.email || "—"}
                    </Link>
                    <span className="text-stone-500">
                      {p.days_remaining} day{p.days_remaining === 1 ? "" : "s"} left
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="card-lift">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
        {title}
      </p>
      <p className="mt-2 font-display text-3xl font-bold text-ink-900">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

function OccupancyCard({
  title,
  count,
  max,
}: {
  title: string;
  count: number;
  max: number;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((count / max) * 100)) : 0;
  const tone =
    pct >= 100
      ? "bg-red-500"
      : pct >= 80
        ? "bg-amber-500"
        : "bg-emerald-500";
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-stone-700">{title}</p>
        <p className="text-sm text-stone-500">
          {count} / {max}
        </p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-100">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function nightCount(start: string, end: string): number {
  const [y1, m1, d1] = start.split("-").map(Number);
  const [y2, m2, d2] = end.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.max(0, Math.round((b - a) / 86400000));
}

function nextMonthStart(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = new Date(y, m, 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}-01`;
}

function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

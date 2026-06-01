import Link from "next/link";
import { requireFullStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Booking,
  BookingAddon,
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
  await requireFullStaff();
  const supabase = await createClient();
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonth = nextMonthStart(today);

  const [
    bookingsRes,
    packagesRes,
    custsRes,
    activePackagesRes,
    liabilityRes,
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
    // All-time prepaid liability: every paid package with days left, regardless
    // of when it was bought.
    supabase
      .from("customer_packages")
      .select("days_remaining, days_total, amount_paid_cents")
      .eq("payment_status", "paid")
      .gt("days_remaining", 0),
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
  // Attendance + cancellation health. Denominator for the no-show rate is
  // bookings whose day actually came (checked in/out or no-showed) — future
  // reservations aren't resolved yet, so they'd only dilute the figure.
  let noShowCount = 0;
  let attendedCount = 0; // checked_in or checked_out
  let canceledCount = 0;
  let canceledByCustomer = 0;
  let canceledByStaff = 0;
  for (const b of monthBookings) {
    if (b.status === "canceled") {
      refunds += b.refund_amount_cents ?? 0;
      canceledCount += 1;
      // The cancel action stamps canceled_by with the actor's profile id.
      // If that's the booking's own customer it was self-service; otherwise
      // staff canceled on their behalf.
      if (b.canceled_by && b.canceled_by === b.customer_id) canceledByCustomer += 1;
      else canceledByStaff += 1;
      continue;
    }
    if (b.service_kind === "daycare") daycareCount += 1;
    else boardingCount += 1;
    if (b.status === "no_show") noShowCount += 1;
    else if (b.status === "checked_in" || b.status === "checked_out") attendedCount += 1;
    if (b.payment_status === "paid" && b.payment_kind === "drop_in" && b.unit_price_cents) {
      const nights = Math.max(1, nightCount(b.service_date, b.service_end_date));
      bookingRevenue += b.unit_price_cents * nights;
    }
    if ((b.refund_amount_cents ?? 0) > 0) {
      refunds += b.refund_amount_cents ?? 0;
    }
  }

  const resolvedCount = attendedCount + noShowCount;
  const noShowRate = resolvedCount > 0 ? noShowCount / resolvedCount : 0;
  const cancellationRate =
    monthBookings.length > 0 ? canceledCount / monthBookings.length : 0;

  // Outstanding prepaid liability: money already collected for package days not
  // yet redeemed. Each remaining day is valued at what the customer actually
  // paid per day (amount_paid / days_total), so coupons/discounts are honored.
  const liabilityRows = (liabilityRes.data ?? []) as {
    days_remaining: number;
    days_total: number;
    amount_paid_cents: number;
  }[];
  let packageLiability = 0;
  let liabilityDays = 0;
  for (const p of liabilityRows) {
    if (p.days_total > 0) {
      packageLiability += Math.round(
        (p.amount_paid_cents / p.days_total) * p.days_remaining,
      );
    }
    liabilityDays += p.days_remaining;
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

  // Outstanding balances: every unpaid, non-canceled booking plus every unpaid
  // dog-wash add-on (any date, not just this month). Stay amounts mirror the
  // billing math used at checkout — nightly rate × nights for boarding, the
  // unit price for a daycare day; washes carry their own flat amount_cents.
  const [{ data: unpaidRows }, { data: unpaidWashRows }] = await Promise.all([
    supabase
      .from("bookings")
      .select("*")
      .eq("payment_status", "unpaid")
      .neq("status", "canceled"),
    supabase
      .from("booking_addons")
      .select("*")
      .eq("payment_status", "unpaid"),
  ]);
  const unpaidBookings = (unpaidRows ?? []) as Booking[];
  const unpaidWashes = (unpaidWashRows ?? []) as BookingAddon[];

  const unpaidByCust = new Map<
    string,
    { amount: number; bookings: number; washes: number }
  >();
  const bumpCust = (id: string) =>
    unpaidByCust.get(id) ?? { amount: 0, bookings: 0, washes: 0 };
  let unpaidTotal = 0;
  for (const b of unpaidBookings) {
    const units =
      b.service_kind === "boarding"
        ? Math.max(1, nightCount(b.service_date, b.service_end_date))
        : 1;
    // Net of any coupon stamped on the booking (a committed price cut, frozen
    // at apply-time). Account credit isn't subtracted here — it's a live pool
    // applied at the moment of payment, so this stays a "before-credit" figure.
    const gross = (b.unit_price_cents ?? 0) * units;
    const amount = Math.max(0, gross - (b.coupon_discount_cents ?? 0));
    unpaidTotal += amount;
    const cur = bumpCust(b.customer_id);
    cur.amount += amount;
    cur.bookings += 1;
    unpaidByCust.set(b.customer_id, cur);
  }
  for (const w of unpaidWashes) {
    unpaidTotal += w.amount_cents;
    const cur = bumpCust(w.customer_id);
    cur.amount += w.amount_cents;
    cur.washes += 1;
    unpaidByCust.set(w.customer_id, cur);
  }
  const unpaidByCustomer = Array.from(unpaidByCust.entries())
    .map(([id, v]) => ({ id, profile: custById.get(id), ...v }))
    .sort((a, b) => b.amount - a.amount);

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
        <StatCard
          title="No-show rate"
          value={formatPct(noShowRate)}
          hint={`${noShowCount} of ${resolvedCount} completed`}
        />
        <StatCard
          title="Cancellation rate"
          value={formatPct(cancellationRate)}
          hint={`${canceledCount} of ${monthBookings.length} · ${canceledByCustomer} by customer, ${canceledByStaff} by us`}
        />
        <StatCard
          title="Prepaid liability"
          value={formatMoney(packageLiability)}
          hint={`${liabilityDays} unredeemed package day${liabilityDays === 1 ? "" : "s"}`}
        />
        <UnpaidCard
          total={unpaidTotal}
          bookingCount={unpaidBookings.length}
          washCount={unpaidWashes.length}
          byCustomer={unpaidByCustomer}
        />
      </div>

      <section>
        <h2 className="text-lg font-semibold text-ink-900">Occupancy</h2>
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
          <h2 className="text-lg font-semibold text-ink-900">
            Top customers (last 90 days)
          </h2>
          {topCustomers.length === 0 ? (
            <p className="mt-2 text-ink-700">No bookings in this window.</p>
          ) : (
            <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
              {topCustomers.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <Link
                    href={`/staff/customers/${t.id}`}
                    className="min-w-0 truncate font-medium text-ink-900 hover:underline"
                  >
                    {t.profile?.full_name || t.profile?.email || "—"}
                  </Link>
                  <span className="shrink-0 text-ink-500">
                    {t.count} booking{t.count === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink-900">
            Low package balances
          </h2>
          <p className="text-xs text-ink-500">
            Customers with 2 days or fewer remaining — nudge them before they
            run out.
          </p>
          {lowPackages.length === 0 ? (
            <p className="mt-2 text-ink-700">Nobody is low right now.</p>
          ) : (
            <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
              {lowPackages.map((p) => {
                const cust = custById.get(p.customer_id);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <Link
                      href={`/staff/customers/${p.customer_id}`}
                      className="min-w-0 truncate font-medium text-ink-900 hover:underline"
                    >
                      {cust?.full_name || cust?.email || "—"}
                    </Link>
                    <span className="shrink-0 text-ink-500">
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

function UnpaidCard({
  total,
  bookingCount,
  washCount,
  byCustomer,
}: {
  total: number;
  bookingCount: number;
  washCount: number;
  byCustomer: {
    id: string;
    profile: Profile | undefined;
    amount: number;
    bookings: number;
    washes: number;
  }[];
}) {
  const parts: string[] = [];
  if (bookingCount > 0) {
    parts.push(`${bookingCount} booking${bookingCount === 1 ? "" : "s"}`);
  }
  if (washCount > 0) {
    parts.push(`${washCount} dog wash${washCount === 1 ? "" : "es"}`);
  }
  const summary = parts.length > 0 ? parts.join(" + ") : "nothing";
  return (
    <details className="card-lift group sm:col-span-2 lg:col-span-4">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Unpaid balance
          </p>
          <p className="mt-2 font-display text-3xl font-bold text-ink-900">
            {formatMoney(total)}
          </p>
          <p className="mt-1.5 text-xs text-ink-500">
            {summary} unpaid
            {byCustomer.length > 0 && (
              <> across {byCustomer.length} customer
                {byCustomer.length === 1 ? "" : "s"}</>
            )}
            {" · "}tap to see by customer
          </p>
        </div>
        <span
          aria-hidden
          className="mt-1 shrink-0 text-ink-400 transition-transform group-open:rotate-90"
        >
          ▸
        </span>
      </summary>
      {byCustomer.length === 0 ? (
        <p className="mt-3 text-sm text-ink-700">No unpaid balances. 🎉</p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {byCustomer.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <Link
                href={`/staff/customers/${c.id}`}
                className="min-w-0 truncate font-medium text-ink-900 hover:underline"
              >
                {c.profile?.full_name || c.profile?.email || "—"}
                <span className="ml-2 text-xs font-normal text-ink-500">
                  {custItemsLabel(c.bookings, c.washes)}
                </span>
              </Link>
              <span className="shrink-0 font-semibold text-red-700">
                {formatMoney(c.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function custItemsLabel(bookings: number, washes: number): string {
  const parts: string[] = [];
  if (bookings > 0) {
    parts.push(`${bookings} booking${bookings === 1 ? "" : "s"}`);
  }
  if (washes > 0) {
    parts.push(`${washes} wash${washes === 1 ? "" : "es"}`);
  }
  return parts.join(" · ");
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
        <p className="text-sm font-medium text-ink-700">{title}</p>
        <p className="text-sm text-ink-500">
          {count} / {max}
        </p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-100">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
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

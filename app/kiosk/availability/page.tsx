import Link from "next/link";
import { requireFullStaff } from "@/lib/auth";
import { getDayCounts, getMaxDogsPerDay, getMaxDogsPerNight } from "@/lib/settings";
import { todayISO } from "@/lib/format";
import type { ServiceKind } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function KioskAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; kind?: string }>;
}) {
  await requireFullStaff();
  const params = await searchParams;
  const kind: ServiceKind = params.kind === "boarding" ? "boarding" : "daycare";
  const monthAnchor = normalizeMonth(params.month) ?? firstOfMonth(todayISO());
  const grid = monthGrid(monthAnchor);

  const [maxDay, maxNight, counts] = await Promise.all([
    getMaxDogsPerDay(),
    getMaxDogsPerNight(),
    getDayCounts(grid.days.map((d) => d.iso), kind),
  ]);

  const max = kind === "boarding" ? maxNight : maxDay;
  const unit = kind === "boarding" ? "dogs/night" : "dogs/day";

  const monthLabel = new Date(
    Number(monthAnchor.slice(0, 4)),
    Number(monthAnchor.slice(5, 7)) - 1,
    1,
  ).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const prevMonth = shiftMonth(monthAnchor, -1).slice(0, 7);
  const nextMonth = shiftMonth(monthAnchor, 1).slice(0, 7);
  const today = todayISO();
  const thisMonth = monthAnchor.slice(0, 7);
  const otherKind: ServiceKind = kind === "boarding" ? "daycare" : "boarding";

  return (
    <div className="space-y-5 animate-fade-up">
      <Link
        href="/kiosk"
        className="text-sm font-medium text-ink-700 hover:text-ink-900 hover:underline"
      >
        ← Back to today
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold text-ink-900">
            Availability
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Capacity {max} {unit} · set in /staff/settings
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/kiosk/availability?month=${prevMonth}&kind=${kind}`}
            className="btn-secondary"
            aria-label="Previous month"
          >
            ←
          </Link>
          <Link
            href={`/kiosk/availability?month=${today.slice(0, 7)}&kind=${kind}`}
            className="btn-secondary"
          >
            Today
          </Link>
          <Link
            href={`/kiosk/availability?month=${nextMonth}&kind=${kind}`}
            className="btn-secondary"
            aria-label="Next month"
          >
            →
          </Link>
        </div>
      </div>

      <div className="inline-flex rounded-2xl border border-stone-200/80 bg-white p-1 text-sm shadow-soft">
        <Link
          href={`/kiosk/availability?month=${thisMonth}&kind=daycare`}
          className={
            "rounded-xl px-3.5 py-1.5 font-semibold transition-colors " +
            (kind === "daycare"
              ? "bg-ink-900 text-white shadow-soft"
              : "text-ink-700 hover:bg-cream-100 hover:text-ink-900")
          }
        >
          Daycare
        </Link>
        <Link
          href={`/kiosk/availability?month=${thisMonth}&kind=boarding`}
          className={
            "rounded-xl px-3.5 py-1.5 font-semibold transition-colors " +
            (kind === "boarding"
              ? "bg-ink-900 text-white shadow-soft"
              : "text-ink-700 hover:bg-cream-100 hover:text-ink-900")
          }
        >
          Boarding
        </Link>
      </div>

      <h2 className="font-display text-xl font-semibold text-ink-900">
        {monthLabel}
      </h2>

      <Legend />

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-stone-200/80 bg-stone-200">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="bg-cream-100 px-2 py-1.5 text-center text-xs font-semibold text-ink-600"
          >
            {d}
          </div>
        ))}
        {grid.days.map((d) => {
          const n = counts.get(d.iso) ?? 0;
          const pct = max > 0 ? n / max : 0;
          const isOther = d.month !== thisMonth;
          const isToday = d.iso === today;
          const cellTone = toneFor(pct, n, isOther);
          return (
            <Link
              key={d.iso}
              href={`/staff/bookings?view=list&from=${d.iso}&to=${d.iso}`}
              className={`flex min-h-[96px] flex-col gap-1 p-2 transition-opacity hover:opacity-80 ${cellTone}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={
                    "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold " +
                    (isToday ? "bg-brand-600 text-white shadow-soft" : "text-ink-900")
                  }
                >
                  {d.day}
                </span>
                <span className="text-xs font-semibold text-ink-700">
                  {n}/{max}
                </span>
              </div>
              <div className="mt-auto h-1.5 w-full rounded-full bg-white/60">
                <div
                  className={"h-full rounded-full " + barColor(pct)}
                  style={{ width: `${Math.min(100, pct * 100)}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>

      <p className="text-xs text-ink-500">
        Showing {kind} bookings.{" "}
        <Link
          href={`/kiosk/availability?month=${thisMonth}&kind=${otherKind}`}
          className="font-semibold text-brand-700 hover:text-brand-900 hover:underline"
        >
          Switch to {otherKind}
        </Link>
        .
      </p>
    </div>
  );
}

function toneFor(pct: number, n: number, isOther: boolean): string {
  if (isOther) return "bg-stone-50 opacity-50";
  if (n === 0) return "bg-white";
  if (pct < 0.5) return "bg-emerald-50";
  if (pct < 0.8) return "bg-amber-50";
  if (pct < 1) return "bg-orange-100";
  return "bg-red-100";
}

function barColor(pct: number): string {
  if (pct < 0.5) return "bg-emerald-500";
  if (pct < 0.8) return "bg-amber-500";
  if (pct < 1) return "bg-orange-500";
  return "bg-red-500";
}

function Legend() {
  const items: { label: string; bar: string; bg: string }[] = [
    { label: "Light (<50%)", bar: "bg-emerald-500", bg: "bg-emerald-50" },
    { label: "Busy (50–80%)", bar: "bg-amber-500", bg: "bg-amber-50" },
    { label: "Almost full (80–99%)", bar: "bg-orange-500", bg: "bg-orange-100" },
    { label: "Full (≥100%)", bar: "bg-red-500", bg: "bg-red-100" },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-700">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-2">
          <span className={`inline-block h-4 w-6 rounded ${i.bg}`}>
            <span className={`block h-1 w-full rounded ${i.bar} mt-2`} />
          </span>
          {i.label}
        </span>
      ))}
    </div>
  );
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
  const start = new Date(y, m - 1, 1 - startOffset);
  const days: { iso: string; day: number; month: string }[] = [];
  for (let i = 0; i < 42; i++) {
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const yy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, "0");
    const dd = String(cur.getDate()).padStart(2, "0");
    days.push({ iso: `${yy}-${mm}-${dd}`, day: cur.getDate(), month: `${yy}-${mm}` });
  }
  return { days, gridStart: days[0].iso, gridEnd: days[days.length - 1].iso };
}

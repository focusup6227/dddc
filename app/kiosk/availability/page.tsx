import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMaxDogsPerDay } from "@/lib/settings";
import { todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function KioskAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const monthAnchor = normalizeMonth(params.month) ?? firstOfMonth(todayISO());
  const grid = monthGrid(monthAnchor);

  const supabase = await createClient();
  const [maxPerDay, { data: bookings }] = await Promise.all([
    getMaxDogsPerDay(),
    supabase
      .from("bookings")
      .select("service_date")
      .gte("service_date", grid.gridStart)
      .lte("service_date", grid.gridEnd)
      .neq("status", "canceled"),
  ]);

  const counts = new Map<string, number>();
  for (const r of bookings ?? []) {
    counts.set(r.service_date, (counts.get(r.service_date) ?? 0) + 1);
  }

  const monthLabel = new Date(
    Number(monthAnchor.slice(0, 4)),
    Number(monthAnchor.slice(5, 7)) - 1,
    1,
  ).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const prevMonth = shiftMonth(monthAnchor, -1).slice(0, 7);
  const nextMonth = shiftMonth(monthAnchor, 1).slice(0, 7);
  const today = todayISO();
  const thisMonth = monthAnchor.slice(0, 7);

  return (
    <div className="space-y-5">
      <Link href="/kiosk" className="text-sm font-medium text-stone-600 hover:text-stone-900">
        ← Back to today
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Availability</h1>
          <p className="text-sm text-stone-600">
            Capacity {maxPerDay} dogs/day · set in /staff/settings
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/kiosk/availability?month=${prevMonth}`}
            className="btn-secondary"
            aria-label="Previous month"
          >
            ←
          </Link>
          <Link
            href={`/kiosk/availability?month=${today.slice(0, 7)}`}
            className="btn-secondary"
          >
            Today
          </Link>
          <Link
            href={`/kiosk/availability?month=${nextMonth}`}
            className="btn-secondary"
            aria-label="Next month"
          >
            →
          </Link>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-stone-900">{monthLabel}</h2>

      <Legend />

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-stone-200 bg-stone-200">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="bg-stone-50 px-2 py-1.5 text-center text-xs font-semibold text-stone-600"
          >
            {d}
          </div>
        ))}
        {grid.days.map((d) => {
          const n = counts.get(d.iso) ?? 0;
          const pct = maxPerDay > 0 ? n / maxPerDay : 0;
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
                    (isToday ? "bg-brand-600 text-white" : "text-stone-800")
                  }
                >
                  {d.day}
                </span>
                <span className="text-xs font-medium text-stone-700">
                  {n}/{maxPerDay}
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
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-stone-700">
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

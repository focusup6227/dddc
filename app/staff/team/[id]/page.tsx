import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Footprints,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { requireFullStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Chore, ChoreKind, Profile } from "@/lib/supabase/types";
import { addDays, formatDateShort, todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";

const KIND_META: Record<
  ChoreKind,
  { label: string; Icon: typeof Footprints; tone: string }
> = {
  walk: { label: "Walk", Icon: Footprints, tone: "text-sky-600 bg-sky-50" },
  sanitize: {
    label: "Sanitize",
    Icon: Sparkles,
    tone: "text-amber-600 bg-amber-50",
  },
  manual: {
    label: "Task",
    Icon: ClipboardList,
    tone: "text-violet-600 bg-violet-50",
  },
};

// Monday of the week containing `iso` (week runs Mon–Sun).
function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  const offset = (dt.getDay() + 6) % 7; // days since Monday
  return addDays(dt, -offset);
}

function normalizeDate(input: string | undefined): string | null {
  if (!input) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : null;
}

// Local YYYY-MM-DD for a timestamp, so chores group under the day they were
// actually completed (avoids the TZ drift of slicing the ISO string).
function localDay(ts: string): string {
  const dt = new Date(ts);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function TeamMemberActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  await requireFullStaff();
  const { id } = await params;
  const { week } = await searchParams;
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", id)
    .maybeSingle<Pick<Profile, "id" | "full_name" | "email" | "role">>();
  if (!member || member.role === "customer") notFound();

  // Week window (Mon–Sun). `week` param is any date inside the desired week.
  const weekStart = mondayOf(normalizeDate(week) ?? todayISO());
  const weekEnd = addDays(weekStart, 6); // inclusive Sunday, for display
  const weekEndExclusive = addDays(weekStart, 7); // exclusive upper bound

  // Chores this member completed during the week, by completion time.
  const { data: choresData } = await supabase
    .from("chores")
    .select("*")
    .eq("completed_by", id)
    .gte("completed_at", `${weekStart}T00:00:00`)
    .lt("completed_at", `${weekEndExclusive}T00:00:00`)
    .order("completed_at", { ascending: true });
  const chores = (choresData ?? []) as Chore[];

  // Group by the local day they were completed.
  const byDay = new Map<string, Chore[]>();
  for (const c of chores) {
    if (!c.completed_at) continue;
    const day = localDay(c.completed_at);
    const arr = byDay.get(day) ?? [];
    arr.push(c);
    byDay.set(day, arr);
  }

  // Seven day rows, Mon→Sun.
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const prevWeek = addDays(weekStart, -7);
  const nextWeek = addDays(weekStart, 7);
  const thisWeekStart = mondayOf(todayISO());
  const isCurrentWeek = weekStart === thisWeekStart;

  const total = chores.length;
  const byKind = {
    walk: chores.filter((c) => c.kind === "walk").length,
    sanitize: chores.filter((c) => c.kind === "sanitize").length,
    manual: chores.filter((c) => c.kind === "manual").length,
  };

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <Link
          href="/staff/team"
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"
        >
          <ChevronLeft size={16} /> Team
        </Link>
        <header className="mt-2">
          <h1 className="font-display text-3xl font-bold text-ink-900">
            {member.full_name || member.email}
            {member.role === "staff" && (
              <span className="ml-2 align-middle pill-success">
                <ShieldCheck size={12} /> Senior
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Chores completed this week
          </p>
        </header>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/staff/team/${id}?week=${prevWeek}`}
          className="btn-secondary inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft size={16} /> Prev
        </Link>
        <div className="text-center">
          <p className="font-semibold text-ink-900">
            {formatDateShort(weekStart)} – {formatDateShort(weekEnd)}
          </p>
          {!isCurrentWeek && (
            <Link
              href={`/staff/team/${id}`}
              className="text-xs text-brand-600 hover:underline"
            >
              Jump to this week
            </Link>
          )}
        </div>
        <Link
          href={`/staff/team/${id}?week=${nextWeek}`}
          className="btn-secondary inline-flex items-center gap-1 text-sm"
        >
          Next <ChevronRight size={16} />
        </Link>
      </div>

      {/* Summary */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Total" value={total} />
        <SummaryStat label="Walks" value={byKind.walk} />
        <SummaryStat label="Sanitize" value={byKind.sanitize} />
        <SummaryStat label="Tasks" value={byKind.manual} />
      </section>

      {/* Per-day breakdown */}
      {total === 0 ? (
        <p className="rounded-2xl border border-stone-200/80 bg-white px-5 py-8 text-center text-sm text-ink-500 shadow-soft">
          No chores completed this week.
        </p>
      ) : (
        <div className="space-y-5">
          {days.map((day) => {
            const items = byDay.get(day) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={day}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="font-display text-lg font-semibold text-ink-900">
                    {formatDateShort(day)}
                  </h2>
                  <span className="text-sm text-ink-500">
                    {items.length} done
                  </span>
                </div>
                <ul className="divide-y divide-stone-200/80 rounded-2xl border border-stone-200/80 bg-white shadow-soft">
                  {items.map((c) => {
                    const meta = KIND_META[c.kind];
                    const Icon = meta.Icon;
                    return (
                      <li
                        key={c.id}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <span
                          className={
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " +
                            meta.tone
                          }
                        >
                          <Icon size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-ink-900">{c.title}</p>
                          <p className="text-xs text-ink-400">{meta.label}</p>
                        </div>
                        {c.completed_at && (
                          <span className="shrink-0 text-xs text-ink-400">
                            {new Date(c.completed_at).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white px-4 py-3 shadow-soft">
      <p className="text-2xl font-bold text-ink-900">{value}</p>
      <p className="text-xs text-ink-500">{label}</p>
    </div>
  );
}

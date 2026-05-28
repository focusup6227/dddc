import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Dog, RecurringBooking } from "@/lib/supabase/types";
import { addDays, formatDateShort, todayISO } from "@/lib/format";
import {
  DEFAULT_DROP_OFF_TIME,
  DEFAULT_PICKUP_TIME,
  EARLIEST_TIME,
  LATEST_TIME,
} from "@/lib/hours";
import { materializeForCustomer } from "@/lib/recurring.server";
import {
  createRecurring,
  deleteRecurring,
  toggleRecurring,
} from "./actions";

export const dynamic = "force-dynamic";

const WEEKDAYS = [
  { idx: 0, label: "Sun" },
  { idx: 1, label: "Mon" },
  { idx: 2, label: "Tue" },
  { idx: 3, label: "Wed" },
  { idx: 4, label: "Thu" },
  { idx: 5, label: "Fri" },
  { idx: 6, label: "Sat" },
];

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; created?: string; error?: string }>;
}) {
  const { userId } = await requireCustomer();
  const params = await searchParams;
  const supabase = await createClient();

  // Refresh materialization so the list stays ~28 days ahead.
  await materializeForCustomer(userId);

  const [dogsRes, schedulesRes] = await Promise.all([
    supabase.from("dogs").select("*").eq("owner_id", userId).eq("active", true).order("name"),
    supabase
      .from("recurring_bookings")
      .select("*")
      .eq("customer_id", userId)
      .order("created_at", { ascending: false }),
  ]);
  const dogs = (dogsRes.data ?? []) as Dog[];
  const schedules = (schedulesRes.data ?? []) as RecurringBooking[];
  const dogById = new Map(dogs.map((d) => [d.id, d]));

  const today = todayISO();
  const horizon = addDays(today, 28);

  if (dogs.length === 0) {
    return (
      <div className="max-w-xl card animate-fade-up">
        <h1 className="font-display text-2xl font-bold text-ink-900">
          Add a dog first
        </h1>
        <p className="mt-2 text-ink-700">
          Set up your dog&apos;s profile before creating a standing schedule.
        </p>
        <Link href="/dogs/new" className="btn-primary mt-4">
          Add a dog
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 animate-fade-up">
      <header>
        <h1 className="font-display text-3xl font-bold text-ink-900">
          Standing schedule
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Pick the weekdays you want your dog at daycare each week. We&apos;ll
          create bookings ahead of time and use your package days first.
        </p>
      </header>

      {params.saved && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800 shadow-soft">
          Schedule saved.
          {params.created && Number(params.created) > 0 && (
            <>
              {" "}
              Created {params.created} booking{params.created === "1" ? "" : "s"}{" "}
              through {formatDateShort(horizon)}.
            </>
          )}
        </div>
      )}
      {params.error && (
        <div className="rounded-2xl border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-800 shadow-soft">
          {params.error}
        </div>
      )}

      <section className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900">
          Add a schedule
        </h2>
        <form action={createRecurring} className="mt-4 space-y-4">
          <div>
            <label className="label" htmlFor="r-dog">Dog</label>
            <select id="r-dog" name="dog_id" required className="input">
              {dogs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className="label">Which days?</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((w) => (
                <label
                  key={w.idx}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700"
                >
                  <input
                    type="checkbox"
                    name={`weekday_${w.idx}`}
                    className="h-4 w-4 rounded border-stone-300"
                  />
                  {w.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="r-start">Starts</label>
              <input
                id="r-start"
                name="start_date"
                type="date"
                required
                defaultValue={today}
                min={today}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="r-end">
                Ends (optional)
              </label>
              <input
                id="r-end"
                name="end_date"
                type="date"
                className="input"
                placeholder="No end date"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="r-drop">Drop-off</label>
              <input
                id="r-drop"
                name="drop_off_time"
                type="time"
                required
                defaultValue={DEFAULT_DROP_OFF_TIME}
                min={EARLIEST_TIME}
                max={LATEST_TIME}
                step={900}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="r-pickup">Pickup</label>
              <input
                id="r-pickup"
                name="pickup_time"
                type="time"
                required
                defaultValue={DEFAULT_PICKUP_TIME}
                min={EARLIEST_TIME}
                max={LATEST_TIME}
                step={900}
                className="input"
              />
            </div>
          </div>

          <p className="text-xs text-stone-500">
            Days that are already booked, closed, or full will be skipped when
            we generate bookings.
          </p>

          <div className="flex justify-end">
            <button type="submit" className="btn-primary">
              Save schedule
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-stone-900">Your schedules</h2>
        {schedules.length === 0 ? (
          <p className="mt-2 text-stone-600">No standing schedules yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {schedules.map((s) => {
              const dog = dogById.get(s.dog_id);
              return (
                <li key={s.id} className="card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-stone-900">
                        {dog?.name ?? "Dog"}
                        {!s.active && (
                          <span className="ml-2 text-xs font-normal text-stone-400">
                            (paused)
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-stone-600">
                        {weekdaysLabel(s.weekdays)} ·{" "}
                        {formatTimeRange(s.drop_off_time, s.pickup_time)}
                      </p>
                      <p className="text-xs text-stone-500">
                        Starts {formatDateShort(s.start_date)}
                        {s.end_date && <> · ends {formatDateShort(s.end_date)}</>}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <form action={toggleRecurring}>
                        <input type="hidden" name="id" value={s.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={s.active ? "false" : "true"}
                        />
                        <button type="submit" className="btn-secondary text-sm">
                          {s.active ? "Pause" : "Resume"}
                        </button>
                      </form>
                      <form action={deleteRecurring}>
                        <input type="hidden" name="id" value={s.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div>
        <Link
          href="/bookings"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          See generated bookings →
        </Link>
      </div>
    </div>
  );
}

function weekdaysLabel(weekdays: number[]): string {
  const sorted = [...weekdays].sort((a, b) => a - b);
  return sorted.map((i) => WEEKDAYS[i]?.label ?? "?").join(", ");
}

function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)} → ${formatTime(end)}`;
}

function formatTime(time: string): string {
  // time is HH:mm:ss or HH:mm
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

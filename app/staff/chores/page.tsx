import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ensureAutoChoresForDate } from "@/lib/chores.server";
import type { Chore, Dog, Profile } from "@/lib/supabase/types";
import { formatDate, todayISO } from "@/lib/format";
import {
  completeChore,
  createManualChore,
  deleteChore,
  uncompleteChore,
} from "./actions";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function StaffChoresPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; done?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const date = normalizeDate(params.date) ?? todayISO();
  const showDone = params.done === "1";

  // Materialize today's auto chores before reading.
  await ensureAutoChoresForDate(date);

  const supabase = await createClient();
  const { data: choresData } = await supabase
    .from("chores")
    .select("*")
    .eq("due_date", date)
    .order("kind")
    .order("title");
  const chores = (choresData ?? []) as Chore[];

  // Lookups
  const dogIds = Array.from(
    new Set(chores.map((c) => c.dog_id).filter(Boolean) as string[]),
  );
  const userIds = Array.from(
    new Set(
      chores
        .map((c) => c.completed_by)
        .filter(Boolean) as string[],
    ),
  );
  const [dogsRes, usersRes, templatesRes] = await Promise.all([
    dogIds.length
      ? supabase.from("dogs").select("id, name").in("id", dogIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("chores")
      .select("*")
      .neq("recurrence", "none")
      .order("created_at"),
  ]);
  const dogById = new Map(
    ((dogsRes.data ?? []) as Pick<Dog, "id" | "name">[]).map((d) => [d.id, d]),
  );
  const userMap = new Map(
    (
      (usersRes.data ?? []) as Pick<Profile, "id" | "full_name" | "email">[]
    ).map((u) => [u.id, { full_name: u.full_name, email: u.email }]),
  );
  const templates = (templatesRes.data ?? []) as Chore[];

  const visible = showDone
    ? chores
    : chores.filter((c) => c.completed_at === null);
  const outstandingCount = chores.filter(
    (c) => c.completed_at === null,
  ).length;
  const doneCount = chores.length - outstandingCount;

  // Group: walks (sub-grouped by dog), sanitize, manual.
  const walks = visible.filter((c) => c.kind === "walk");
  const sanitize = visible.filter((c) => c.kind === "sanitize");
  const manual = visible.filter((c) => c.kind === "manual");

  const walksByDog = new Map<string, Chore[]>();
  for (const w of walks) {
    if (!w.dog_id) continue;
    const arr = walksByDog.get(w.dog_id) ?? [];
    arr.push(w);
    walksByDog.set(w.dog_id, arr);
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Chores</h1>
          <p className="text-stone-600">
            {formatDate(date)} · {outstandingCount} to do
            {doneCount > 0 && (
              <span className="text-stone-400"> · {doneCount} done</span>
            )}
          </p>
        </div>
        <form className="flex items-end gap-2 text-sm">
          {showDone && <input type="hidden" name="done" value="1" />}
          <label className="block">
            <span className="block text-xs text-stone-500">Date</span>
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="input"
            />
          </label>
          <button type="submit" className="btn-secondary">
            Go
          </button>
          <Link
            href={`/staff/chores?date=${date}${showDone ? "" : "&done=1"}`}
            className="btn-secondary"
          >
            {showDone ? "Hide done" : "Show done"}
          </Link>
        </form>
      </header>

      <Section title="🐕 Walks">
        {walksByDog.size === 0 ? (
          <Empty
            text={
              walks.length === 0 && !showDone && outstandingCount > 0
                ? "All walks done!"
                : "No dogs checked in today."
            }
          />
        ) : (
          <div className="space-y-3">
            {Array.from(walksByDog.entries()).map(([dogId, items]) => {
              const dog = dogById.get(dogId);
              return (
                <div
                  key={dogId}
                  className="rounded-lg border border-stone-200 bg-white p-3"
                >
                  <p className="mb-2 font-medium text-stone-900">
                    {dog?.name ?? "Dog"}
                  </p>
                  <ul className="divide-y divide-stone-100">
                    {items
                      .sort((a, b) =>
                        (a.auto_key ?? "").localeCompare(b.auto_key ?? ""),
                      )
                      .map((c) => (
                        <ChoreRow
                          key={c.id}
                          chore={c}
                          completedByName={
                            c.completed_by
                              ? userMap.get(c.completed_by)?.full_name ??
                                userMap.get(c.completed_by)?.email ??
                                "staff"
                              : null
                          }
                          title={
                            c.auto_key === "walk_am"
                              ? "Morning walk"
                              : "Afternoon walk"
                          }
                        />
                      ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="🧼 Cleaning">
        {sanitize.length === 0 ? (
          <Empty text={showDone ? "Nothing here." : "All clean!"} />
        ) : (
          <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
            {sanitize.map((c) => (
              <ChoreRow
                key={c.id}
                chore={c}
                completedByName={
                  c.completed_by
                    ? userMap.get(c.completed_by)?.full_name ??
                      userMap.get(c.completed_by)?.email ??
                      "staff"
                    : null
                }
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title="📋 Other">
        {manual.length === 0 ? (
          <Empty text={showDone ? "Nothing here." : "No other chores."} />
        ) : (
          <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
            {manual.map((c) => (
              <ChoreRow
                key={c.id}
                chore={c}
                completedByName={
                  c.completed_by
                    ? userMap.get(c.completed_by)?.full_name ??
                      userMap.get(c.completed_by)?.email ??
                      "staff"
                    : null
                }
                deletable={c.parent_chore_id === null}
              />
            ))}
          </ul>
        )}
      </Section>

      <section className="card">
        <h2 className="font-semibold text-stone-900">Add a chore</h2>
        <p className="mt-1 text-xs text-stone-500">
          One-off chore for a specific day, or a recurring task that
          auto-populates daily or weekly.
        </p>
        <form action={createManualChore} className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="ch-title">
              Title
            </label>
            <input
              id="ch-title"
              name="title"
              type="text"
              required
              className="input"
              placeholder="Restock treats"
            />
          </div>
          <div>
            <label className="label" htmlFor="ch-desc">
              Notes (optional)
            </label>
            <textarea
              id="ch-desc"
              name="description"
              rows={2}
              className="input"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="ch-rec">
                Repeat
              </label>
              <select
                id="ch-rec"
                name="recurrence"
                defaultValue="none"
                className="input"
              >
                <option value="none">Just once</option>
                <option value="daily">Every day</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ch-date">
                Date (if one-off)
              </label>
              <input
                id="ch-date"
                name="due_date"
                type="date"
                defaultValue={date}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="ch-weekday">
                Weekday (if weekly)
              </label>
              <select
                id="ch-weekday"
                name="weekday"
                defaultValue="1"
                className="input"
              >
                {WEEKDAYS.map((w, i) => (
                  <option key={w} value={i}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn-primary">
              Add chore
            </button>
          </div>
        </form>
      </section>

      {templates.length > 0 && (
        <section className="card">
          <h2 className="font-semibold text-stone-900">Recurring chores</h2>
          <p className="mt-1 text-xs text-stone-500">
            Templates that auto-add an instance to the list.
          </p>
          <ul className="mt-3 divide-y divide-stone-100">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-stone-900">{t.title}</p>
                  <p className="text-xs text-stone-500">
                    {t.recurrence === "daily"
                      ? "Every day"
                      : `Weekly · ${WEEKDAYS[t.weekday ?? 1]}`}
                  </p>
                </div>
                <form action={deleteChore}>
                  <input type="hidden" name="id" value={t.id} />
                  <button
                    type="submit"
                    className="text-xs font-medium text-stone-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold text-stone-900">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-stone-500">{text}</p>;
}

function ChoreRow({
  chore,
  completedByName,
  title,
  deletable,
}: {
  chore: Chore;
  completedByName: string | null;
  title?: string;
  deletable?: boolean;
}) {
  const done = chore.completed_at !== null;
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <form
        action={done ? uncompleteChore : completeChore}
        className="flex flex-1 items-center gap-3"
      >
        <input type="hidden" name="id" value={chore.id} />
        <button
          type="submit"
          aria-label={done ? "Mark not done" : "Mark done"}
          className={
            "flex h-6 w-6 shrink-0 items-center justify-center rounded border " +
            (done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-stone-300 bg-white hover:border-stone-500")
          }
        >
          {done && (
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4L8.5 12 15.3 5.3a1 1 0 011.4 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>
        <div className="min-w-0 flex-1 text-left">
          <p
            className={
              done
                ? "text-stone-500 line-through"
                : "text-stone-900"
            }
          >
            {title ?? chore.title}
          </p>
          {chore.description && !done && (
            <p className="text-xs text-stone-500">{chore.description}</p>
          )}
          {done && completedByName && (
            <p className="text-xs text-stone-400">
              by {completedByName}
            </p>
          )}
        </div>
      </form>
      {deletable && (
        <form action={deleteChore}>
          <input type="hidden" name="id" value={chore.id} />
          <button
            type="submit"
            className="text-xs font-medium text-stone-400 hover:text-red-600"
            aria-label="Delete chore"
          >
            ✕
          </button>
        </form>
      )}
    </li>
  );
}

function normalizeDate(input: string | undefined): string | null {
  if (!input) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : null;
}

import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Event } from "@/lib/supabase/types";
import { formatDateShort, todayISO } from "@/lib/format";
import { StaffSubNav } from "@/components/StaffSubNav";
import { ToastNotifier } from "@/components/ToastNotifier";
import { createEvent, deleteEvent, updateEvent } from "./actions";

const TOASTS = [
  { param: "saved", message: "Saved." },
  { param: "error", tone: "error" as const },
];

const SUBNAV = [
  { href: "/staff/settings", label: "General" },
  { href: "/staff/packages", label: "Packages" },
  { href: "/staff/coupons", label: "Coupons" },
  { href: "/staff/events", label: "Events", active: true },
];

export const dynamic = "force-dynamic";

export default async function StaffEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; edit?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const supabase = await createClient();
  const today = todayISO();

  const [upcomingRes, pastRes] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .gte("end_date", today)
      .order("start_date"),
    supabase
      .from("events")
      .select("*")
      .lt("end_date", today)
      .order("start_date", { ascending: false })
      .limit(20),
  ]);
  const upcoming = (upcomingRes.data ?? []) as Event[];
  const past = (pastRes.data ?? []) as Event[];

  const editing =
    params.edit
      ? upcoming.find((e) => e.id === params.edit) ??
        past.find((e) => e.id === params.edit) ??
        null
      : null;

  return (
    <div className="space-y-8 animate-fade-up">
      <StaffSubNav items={SUBNAV} />
      <header>
        <h1 className="font-display text-3xl font-bold text-ink-900">Events</h1>
        <p className="mt-1 text-sm text-ink-500">
          Special days customers see on the booking calendar. Click an event to
          edit; deleting can&apos;t be undone.
        </p>
      </header>

      <ToastNotifier toasts={TOASTS} />

      <EventForm event={editing} />

      <Section title="Upcoming" events={upcoming} emptyText="No upcoming events." />
      <Section title="Past" events={past} emptyText="No past events." />
    </div>
  );
}

function EventForm({ event }: { event: Event | null }) {
  const isEdit = !!event;
  return (
    <section className="card">
      <h2 className="font-semibold text-ink-900">
        {isEdit ? "Edit event" : "Add an event"}
      </h2>
      <form
        action={isEdit ? updateEvent : createEvent}
        className="mt-4 space-y-3"
      >
        {isEdit && <input type="hidden" name="id" value={event!.id} />}
        <div>
          <label className="label" htmlFor="ev-title">
            Title
          </label>
          <input
            id="ev-title"
            name="title"
            type="text"
            required
            defaultValue={event?.title ?? ""}
            placeholder="Halloween pup party"
            className="input"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ev-start">
              Start date
            </label>
            <input
              id="ev-start"
              name="start_date"
              type="date"
              required
              defaultValue={event?.start_date ?? ""}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="ev-end">
              End date
            </label>
            <input
              id="ev-end"
              name="end_date"
              type="date"
              required
              defaultValue={event?.end_date ?? ""}
              className="input"
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ev-desc">
            Description (optional)
          </label>
          <textarea
            id="ev-desc"
            name="description"
            rows={4}
            defaultValue={event?.description ?? ""}
            placeholder="What's happening? Anything customers should know?"
            className="input"
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {isEdit && (
            <a href="/staff/events" className="btn-secondary">
              Cancel
            </a>
          )}
          <button type="submit" className="btn-primary">
            {isEdit ? "Save changes" : "Create event"}
          </button>
        </div>
      </form>
    </section>
  );
}

function Section({
  title,
  events,
  emptyText,
}: {
  title: string;
  events: Event[];
  emptyText: string;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-ink-900">
        {title}{" "}
        <span className="ml-1 text-sm font-normal text-ink-500">
          ({events.length})
        </span>
      </h2>
      {events.length === 0 ? (
        <p className="mt-2 text-ink-700">{emptyText}</p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {events.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink-900">{e.title}</p>
                <p className="text-xs text-ink-500">
                  {e.start_date === e.end_date
                    ? formatDateShort(e.start_date)
                    : `${formatDateShort(e.start_date)} → ${formatDateShort(e.end_date)}`}
                </p>
                {e.description && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">
                    {e.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={`/staff/events?edit=${e.id}`}
                  className="btn-secondary text-sm"
                >
                  Edit
                </a>
                <form action={deleteEvent}>
                  <input type="hidden" name="id" value={e.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

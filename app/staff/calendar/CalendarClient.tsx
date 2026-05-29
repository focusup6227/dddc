"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Blackout, Event } from "@/lib/supabase/types";
import { formatDateShort } from "@/lib/format";
import {
  createBlackout,
  createEvent,
  deleteBlackout,
  deleteEvent,
  updateBlackout,
  updateEvent,
} from "./actions";

type SerializedBooking = {
  id: string;
  dog_id: string;
  customer_id: string;
  service_kind: string;
  status: string;
  payment_status: string;
};

export function CalendarClient({
  monthAnchor,
  monthLabel,
  prevMonthHref,
  nextMonthHref,
  todayHref,
  today,
  days,
  bookingsByDate,
  eventsByDate,
  blackoutsByDate,
  events,
  blackouts,
  dogsById,
  custsById,
  initialDate,
  monthKey,
}: {
  monthAnchor: string;
  monthLabel: string;
  prevMonthHref: string;
  nextMonthHref: string;
  todayHref: string;
  today: string;
  days: { iso: string; day: number; month: string }[];
  bookingsByDate: Record<string, SerializedBooking[]>;
  eventsByDate: Record<string, Event[]>;
  blackoutsByDate: Record<string, Blackout[]>;
  events: Event[];
  blackouts: Blackout[];
  dogsById: Record<string, { id: string; name: string }>;
  custsById: Record<string, { id: string; full_name: string; email: string }>;
  initialDate: string | null;
  monthKey: string;
}) {
  const [openDate, setOpenDate] = useState<string | null>(initialDate);

  const monthEvents = useMemo(
    () => events.filter((e) => e.start_date.slice(0, 7) === monthKey || dateIntersectsMonth(e.start_date, e.end_date, monthKey)),
    [events, monthKey],
  );
  const monthBlackouts = useMemo(
    () =>
      blackouts.filter((b) =>
        dateIntersectsMonth(b.start_date, b.end_date, monthKey),
      ),
    [blackouts, monthKey],
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink-900">{monthLabel}</h2>
        <div className="flex gap-2">
          <Link
            href={prevMonthHref}
            className="btn-secondary"
            aria-label="Previous month"
          >
            ←
          </Link>
          <Link href={todayHref} className="btn-secondary">
            Today
          </Link>
          <Link
            href={nextMonthHref}
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
        {days.map((d) => {
          const dayBookings = bookingsByDate[d.iso] ?? [];
          const dayEvents = eventsByDate[d.iso] ?? [];
          const dayBlackouts = blackoutsByDate[d.iso] ?? [];
          const isOther = d.month !== monthAnchor.slice(0, 7);
          const isToday = d.iso === today;
          const hasBlackout = dayBlackouts.length > 0;
          return (
            <button
              key={d.iso}
              type="button"
              onClick={() => setOpenDate(d.iso)}
              className={
                "flex min-h-[68px] flex-col gap-1 p-1 text-left transition-colors hover:bg-brand-50 sm:min-h-[120px] sm:p-1.5 " +
                (hasBlackout
                  ? "bg-stone-100 bg-[repeating-linear-gradient(45deg,_rgba(120,113,108,0.08)_0,_rgba(120,113,108,0.08)_4px,_transparent_4px,_transparent_8px)] "
                  : "bg-white ") +
                (isOther ? "opacity-40 " : "")
              }
              aria-label={`Open ${d.iso}`}
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
                      aria-hidden
                      title={dayEvents.map((e) => e.title).join(" · ")}
                      className="inline-block h-2 w-2 rounded-full bg-amber-500"
                    />
                  )}
                  {dayBookings.length > 0 && (
                    <span className="text-xs font-medium text-ink-500">
                      <span className="hidden sm:inline">
                        {dayBookings.length} dog
                        {dayBookings.length === 1 ? "" : "s"}
                      </span>
                      <span className="sm:hidden">{dayBookings.length}</span>
                    </span>
                  )}
                </div>
              </div>
              {hasBlackout && (
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500 sm:text-xs">
                  Closed
                </p>
              )}
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
                  const dog = dogsById[b.dog_id];
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
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Panel
          title="Events this month"
          empty="No events scheduled this month."
          items={monthEvents}
          render={(e) => (
            <EventInlineRow
              key={e.id}
              event={e}
              onOpen={() => setOpenDate(e.start_date)}
            />
          )}
        />
        <Panel
          title="Blackouts this month"
          empty="No blackouts."
          items={monthBlackouts}
          render={(b) => (
            <BlackoutInlineRow
              key={b.id}
              blackout={b}
              onOpen={() => setOpenDate(b.start_date)}
            />
          )}
        />
      </div>

      {openDate && (
        <DayModal
          date={openDate}
          monthKey={monthKey}
          onClose={() => setOpenDate(null)}
          bookings={bookingsByDate[openDate] ?? []}
          events={(eventsByDate[openDate] ?? []) as Event[]}
          blackouts={(blackoutsByDate[openDate] ?? []) as Blackout[]}
          dogsById={dogsById}
          custsById={custsById}
        />
      )}
    </>
  );
}

function Panel<T>({
  title,
  empty,
  items,
  render,
}: {
  title: string;
  empty: string;
  items: T[];
  render: (item: T) => React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">{items.map(render)}</ul>
      )}
    </section>
  );
}

function EventInlineRow({
  event,
  onOpen,
}: {
  event: Event;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-left hover:border-brand-400 hover:bg-brand-50"
      >
        <span className="mt-0.5 inline-flex h-2 w-2 shrink-0 rounded-full bg-amber-500" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink-900">
            {event.title}
          </span>
          <span className="block text-xs text-ink-500">
            {rangeLabel(event.start_date, event.end_date)}
          </span>
        </span>
      </button>
    </li>
  );
}

function BlackoutInlineRow({
  blackout,
  onOpen,
}: {
  blackout: Blackout;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-left hover:border-stone-400 hover:bg-stone-50"
      >
        <span className="mt-1 inline-block h-3 w-3 shrink-0 rounded-sm bg-[repeating-linear-gradient(45deg,_#a8a29e_0,_#a8a29e_2px,_transparent_2px,_transparent_4px)]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink-900">
            {blackout.reason ?? "Closed"}
          </span>
          <span className="block text-xs text-ink-500">
            {rangeLabel(blackout.start_date, blackout.end_date)}
            {" · "}
            {kindsLabel(blackout)}
          </span>
        </span>
      </button>
    </li>
  );
}

function DayModal({
  date,
  monthKey,
  onClose,
  bookings,
  events,
  blackouts,
  dogsById,
  custsById,
}: {
  date: string;
  monthKey: string;
  onClose: () => void;
  bookings: SerializedBooking[];
  events: Event[];
  blackouts: Blackout[];
  dogsById: Record<string, { id: string; name: string }>;
  custsById: Record<string, { id: string; full_name: string; email: string }>;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingBlackoutId, setEditingBlackoutId] = useState<string | null>(
    null,
  );
  const [adding, setAdding] = useState<"event" | "blackout" | null>(null);

  const editingEvent = events.find((e) => e.id === editingEventId) ?? null;
  const editingBlackout =
    blackouts.find((b) => b.id === editingBlackoutId) ?? null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/50 px-2 py-2 sm:items-center sm:px-4 sm:py-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-ink-900">
              {formatDateShort(date)}
            </h3>
            <p className="text-xs text-ink-500">
              {bookings.length} booking{bookings.length === 1 ? "" : "s"} ·{" "}
              {events.length} event{events.length === 1 ? "" : "s"} ·{" "}
              {blackouts.length} blackout{blackouts.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-500 hover:bg-stone-100"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
              aria-hidden
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
          <Section title="Bookings">
            {bookings.length === 0 ? (
              <p className="text-sm text-ink-500">No bookings.</p>
            ) : (
              <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
                {bookings.map((b) => {
                  const dog = dogsById[b.dog_id];
                  const cust = custsById[b.customer_id];
                  return (
                    <li
                      key={b.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink-900">
                          {dog?.name ?? "Dog"}{" "}
                          <span className="text-ink-500">
                            · {cust?.full_name || cust?.email || "—"}
                          </span>
                        </p>
                        <p className="text-xs text-ink-500">
                          {b.service_kind} · {b.status} · {b.payment_status}
                        </p>
                      </div>
                      <Link
                        href={`/staff/bookings?view=list&from=${date}&to=${date}`}
                        className="text-xs font-medium text-brand-700 hover:underline"
                        onClick={onClose}
                      >
                        Open →
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section
            title="Events"
            cta={
              adding === "event" || editingEventId ? null : (
                <button
                  type="button"
                  onClick={() => {
                    setAdding("event");
                    setEditingEventId(null);
                  }}
                  className="btn-secondary text-xs"
                >
                  + Add event
                </button>
              )
            }
          >
            {events.length === 0 && !adding && !editingEventId ? (
              <p className="text-sm text-ink-500">No events.</p>
            ) : (
              <ul className="space-y-2">
                {events.map((e) =>
                  editingEventId === e.id ? (
                    <li key={e.id}>
                      <EventForm
                        event={e}
                        date={date}
                        monthKey={monthKey}
                        onCancel={() => setEditingEventId(null)}
                      />
                    </li>
                  ) : (
                    <li
                      key={e.id}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink-900">{e.title}</p>
                        <p className="text-xs text-ink-500">
                          {rangeLabel(e.start_date, e.end_date)}
                        </p>
                        {e.description && (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">
                            {e.description}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEventId(e.id);
                            setAdding(null);
                          }}
                          className="btn-secondary text-xs"
                        >
                          Edit
                        </button>
                        <form action={deleteEvent}>
                          <input type="hidden" name="id" value={e.id} />
                          <input
                            type="hidden"
                            name="month"
                            value={monthKey}
                          />
                          <button
                            type="submit"
                            className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
            {adding === "event" && (
              <div className="mt-3">
                <EventForm
                  event={null}
                  date={date}
                  monthKey={monthKey}
                  onCancel={() => setAdding(null)}
                />
              </div>
            )}
          </Section>

          <Section
            title="Blackouts"
            cta={
              adding === "blackout" || editingBlackoutId ? null : (
                <button
                  type="button"
                  onClick={() => {
                    setAdding("blackout");
                    setEditingBlackoutId(null);
                  }}
                  className="btn-secondary text-xs"
                >
                  + Add blackout
                </button>
              )
            }
          >
            {blackouts.length === 0 && !adding && !editingBlackoutId ? (
              <p className="text-sm text-ink-500">No blackouts.</p>
            ) : (
              <ul className="space-y-2">
                {blackouts.map((b) =>
                  editingBlackoutId === b.id ? (
                    <li key={b.id}>
                      <BlackoutForm
                        blackout={b}
                        date={date}
                        monthKey={monthKey}
                        onCancel={() => setEditingBlackoutId(null)}
                      />
                    </li>
                  ) : (
                    <li
                      key={b.id}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink-900">
                          {b.reason ?? "Closed"}
                        </p>
                        <p className="text-xs text-ink-500">
                          {rangeLabel(b.start_date, b.end_date)} ·{" "}
                          {kindsLabel(b)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBlackoutId(b.id);
                            setAdding(null);
                          }}
                          className="btn-secondary text-xs"
                        >
                          Edit
                        </button>
                        <form action={deleteBlackout}>
                          <input type="hidden" name="id" value={b.id} />
                          <input
                            type="hidden"
                            name="month"
                            value={monthKey}
                          />
                          <button
                            type="submit"
                            className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
            {adding === "blackout" && (
              <div className="mt-3">
                <BlackoutForm
                  blackout={null}
                  date={date}
                  monthKey={monthKey}
                  onCancel={() => setAdding(null)}
                />
              </div>
            )}
          </Section>

          <p className="text-xs text-ink-500">
            Currently editing this day in isolation. To edit{" "}
            {editingEvent || editingBlackout ? "elsewhere" : "an event/blackout that started on another day"}, navigate
            from the panels below the calendar.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  cta,
  children,
}: {
  title: string;
  cta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
          {title}
        </h4>
        {cta}
      </div>
      {children}
    </section>
  );
}

function EventForm({
  event,
  date,
  monthKey,
  onCancel,
}: {
  event: Event | null;
  date: string;
  monthKey: string;
  onCancel: () => void;
}) {
  const isEdit = !!event;
  return (
    <form
      action={isEdit ? updateEvent : createEvent}
      className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-3"
    >
      {isEdit && <input type="hidden" name="id" value={event!.id} />}
      <input type="hidden" name="month" value={monthKey} />
      <div>
        <label className="label">Title</label>
        <input
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
          <label className="label">Start date</label>
          <input
            name="start_date"
            type="date"
            required
            defaultValue={event?.start_date ?? date}
            className="input"
          />
        </div>
        <div>
          <label className="label">End date</label>
          <input
            name="end_date"
            type="date"
            required
            defaultValue={event?.end_date ?? date}
            className="input"
          />
        </div>
      </div>
      <div>
        <label className="label">Description (optional)</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={event?.description ?? ""}
          className="input"
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          {isEdit ? "Save changes" : "Create event"}
        </button>
      </div>
    </form>
  );
}

function BlackoutForm({
  blackout,
  date,
  monthKey,
  onCancel,
}: {
  blackout: Blackout | null;
  date: string;
  monthKey: string;
  onCancel: () => void;
}) {
  const isEdit = !!blackout;
  return (
    <form
      action={isEdit ? updateBlackout : createBlackout}
      className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-3"
    >
      {isEdit && <input type="hidden" name="id" value={blackout!.id} />}
      <input type="hidden" name="month" value={monthKey} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Start date</label>
          <input
            name="start_date"
            type="date"
            required
            defaultValue={blackout?.start_date ?? date}
            className="input"
          />
        </div>
        <div>
          <label className="label">End date</label>
          <input
            name="end_date"
            type="date"
            required
            defaultValue={blackout?.end_date ?? date}
            className="input"
          />
        </div>
      </div>
      <div>
        <label className="label">Reason (optional)</label>
        <input
          name="reason"
          type="text"
          defaultValue={blackout?.reason ?? ""}
          placeholder="Closed for Thanksgiving"
          className="input"
        />
      </div>
      <fieldset className="space-y-1.5">
        <legend className="label">Block which services?</legend>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            name="blocks_daycare"
            defaultChecked={blackout ? blackout.blocks_daycare : true}
            className="h-4 w-4 rounded border-stone-300"
          />
          Day care
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            name="blocks_boarding"
            defaultChecked={blackout ? blackout.blocks_boarding : true}
            className="h-4 w-4 rounded border-stone-300"
          />
          Boarding
        </label>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          {isEdit ? "Save changes" : "Block these dates"}
        </button>
      </div>
    </form>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls =
    status === "checked_in"
      ? "bg-emerald-500"
      : status === "checked_out"
        ? "bg-sky-500"
        : status === "no_show"
          ? "bg-red-500"
          : "bg-stone-300 ring-1 ring-stone-400";
  return (
    <span
      aria-label={status}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`}
    />
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-700">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
        Event
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm bg-[repeating-linear-gradient(45deg,_#a8a29e_0,_#a8a29e_2px,_transparent_2px,_transparent_4px)]" />
        Blackout (closed)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        Checked in
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
        Checked out
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-stone-300 ring-1 ring-stone-400" />
        Scheduled
      </span>
    </div>
  );
}

function rangeLabel(start: string, end: string): string {
  return start === end
    ? formatDateShort(start)
    : `${formatDateShort(start)} → ${formatDateShort(end)}`;
}

function kindsLabel(b: Blackout): string {
  if (b.blocks_daycare && b.blocks_boarding) return "Daycare + Boarding";
  if (b.blocks_daycare) return "Daycare";
  return "Boarding";
}

function dateIntersectsMonth(
  start: string,
  end: string,
  monthKey: string,
): boolean {
  return start.slice(0, 7) <= monthKey && end.slice(0, 7) >= monthKey;
}

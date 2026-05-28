"use client";

import { useEffect, useState } from "react";
import type { Event } from "@/lib/supabase/types";
import { formatDateShort } from "@/lib/format";

export function EventList({
  events,
  title = "Events",
  emptyText = "No upcoming events.",
  compact = false,
}: {
  events: Event[];
  title?: string;
  emptyText?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState<Event | null>(null);

  if (events.length === 0 && compact) return null;

  return (
    <section className={compact ? "" : ""}>
      <h2
        className={
          compact
            ? "text-sm font-semibold text-ink-900"
            : "font-display text-xl font-semibold text-ink-900"
        }
      >
        {title}
      </h2>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">{emptyText}</p>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {events.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setOpen(e)}
                className="flex w-full items-start gap-3 rounded-xl border border-stone-200/80 bg-white px-3.5 py-2.5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
              >
                <span className="mt-1.5 inline-flex h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink-900">
                    {e.title}
                  </span>
                  <span className="block text-xs text-ink-500">
                    {dateRangeLabel(e)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <EventModal event={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

export function EventModal({
  event,
  onClose,
}: {
  event: Event;
  onClose: () => void;
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 px-2 py-2 backdrop-blur-sm animate-fade-in sm:items-center sm:px-4 sm:py-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-stone-200 bg-white shadow-lift animate-fade-up"
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-200/80 px-5 py-4">
          <div className="min-w-0">
            <h3
              id="event-modal-title"
              className="font-display text-xl font-semibold text-ink-900"
            >
              {event.title}
            </h3>
            <p className="mt-0.5 text-sm text-ink-500">{dateRangeLabel(event)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-500 hover:bg-cream-100 hover:text-ink-900"
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
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-5">
          {event.description ? (
            <p className="whitespace-pre-wrap text-sm text-ink-900">
              {event.description}
            </p>
          ) : (
            <p className="text-sm text-ink-500">No description.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function dateRangeLabel(e: Event): string {
  return e.start_date === e.end_date
    ? formatDateShort(e.start_date)
    : `${formatDateShort(e.start_date)} → ${formatDateShort(e.end_date)}`;
}

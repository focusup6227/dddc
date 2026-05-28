"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Dog, Event, VaccineType } from "@/lib/supabase/types";
import { formatMoney } from "@/lib/format";
import {
  DEFAULT_DROP_OFF_TIME,
  DEFAULT_PICKUP_TIME,
  EARLIEST_TIME,
  LATEST_TIME,
} from "@/lib/hours";
import { EventList } from "@/components/EventList";
import { createBooking } from "./actions";

export function BookForm({
  dogs,
  daysRemaining,
  dropInPriceCents,
  existingBookings,
  startDate,
  fullDates,
  vaccineBlocks,
  vaccineLabels,
  events,
  eventDates,
  blackoutDates,
  blackoutReasonByDate,
}: {
  dogs: Dog[];
  daysRemaining: number;
  dropInPriceCents: number | null;
  existingBookings: { dog_id: string; service_date: string }[];
  startDate: string;
  fullDates: string[];
  vaccineBlocks: Record<string, VaccineType[]>;
  vaccineLabels: Record<VaccineType, string>;
  events: Event[];
  eventDates: string[];
  blackoutDates: string[];
  blackoutReasonByDate: Record<string, string>;
}) {
  const firstReady = dogs.find((d) => !vaccineBlocks[d.id]?.length);
  const [dogId, setDogId] = useState(firstReady?.id ?? dogs[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dropOffTime, setDropOffTime] = useState(DEFAULT_DROP_OFF_TIME);
  const [pickupTime, setPickupTime] = useState(DEFAULT_PICKUP_TIME);
  const timesValid =
    dropOffTime >= EARLIEST_TIME &&
    dropOffTime <= LATEST_TIME &&
    pickupTime >= EARLIEST_TIME &&
    pickupTime <= LATEST_TIME &&
    pickupTime > dropOffTime;

  const blockedMissing = vaccineBlocks[dogId] ?? [];
  const dogBlocked = blockedMissing.length > 0;

  const taken = useMemo(() => {
    const s = new Set<string>();
    for (const b of existingBookings) {
      if (b.dog_id === dogId) s.add(b.service_date);
    }
    return s;
  }, [existingBookings, dogId]);

  const full = useMemo(() => new Set(fullDates), [fullDates]);
  const eventSet = useMemo(() => new Set(eventDates), [eventDates]);
  const blackoutSet = useMemo(() => new Set(blackoutDates), [blackoutDates]);

  const days = useMemo(() => generateDays(startDate, 42), [startDate]);

  function toggle(date: string) {
    if (taken.has(date) || full.has(date) || blackoutSet.has(date)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  const selectedCount = selected.size;
  const packageDaysUsed = Math.min(selectedCount, daysRemaining);
  const dropInDaysNeeded = selectedCount - packageDaysUsed;
  const dropInTotalCents = dropInPriceCents ? dropInDaysNeeded * dropInPriceCents : 0;

  return (
    <form action={createBooking} className="mt-6 space-y-6">
      <input type="hidden" name="dog_id" value={dogId} />
      <input
        type="hidden"
        name="service_dates"
        value={Array.from(selected).sort().join(",")}
      />
      <input type="hidden" name="drop_off_time" value={dropOffTime} />
      <input type="hidden" name="pickup_time" value={pickupTime} />

      <section className="card">
        <h3 className="font-semibold text-ink-900">Dog</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {dogs.map((d) => {
            const isBlocked = (vaccineBlocks[d.id]?.length ?? 0) > 0;
            const isSelected = dogId === d.id;
            return (
              <button
                type="button"
                key={d.id}
                onClick={() => {
                  setDogId(d.id);
                  setSelected(new Set());
                }}
                className={
                  "rounded-full border px-3 py-1.5 text-sm " +
                  (isSelected
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : isBlocked
                      ? "border-stone-200/80 bg-cream-50 text-ink-500"
                      : "border-stone-300 text-ink-700 hover:bg-cream-50")
                }
                title={isBlocked ? "Missing required vaccine records" : undefined}
              >
                {d.name}
                {isBlocked && " ⚠"}
              </button>
            );
          })}
        </div>
        {dogBlocked && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-medium">
              {dogs.find((d) => d.id === dogId)?.name} can&apos;t be booked yet.
            </p>
            <p className="mt-1">
              Needs:{" "}
              {blockedMissing
                .map((k) => vaccineLabels[k])
                .join(", ")}
              . Records must be verified and not expired by your last booked day.
            </p>
            <Link
              href={`/dogs/${dogId}`}
              className="mt-2 inline-block font-medium text-amber-900 underline"
            >
              Upload records →
            </Link>
          </div>
        )}
      </section>

      <section className="card">
        <h3 className="font-semibold text-ink-900">Dates</h3>
        <p className="mt-1 text-sm text-ink-500">
          Pick the days you&apos;d like to drop off. Greyed-out days are already booked.
        </p>
        <div className="mt-4 grid grid-cols-7 gap-1 text-xs">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="py-1 text-center font-medium text-ink-500">
              {d}
            </div>
          ))}
          {days.padding.map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {days.list.map((d) => {
            const isTaken = taken.has(d.iso);
            const isFull = full.has(d.iso);
            const isSelected = selected.has(d.iso);
            const isPast = d.iso < startDate;
            const isEvent = eventSet.has(d.iso);
            const isBlackout = blackoutSet.has(d.iso);
            const disabled = isTaken || isFull || isPast || isBlackout;
            const closedReason = isBlackout
              ? blackoutReasonByDate[d.iso] ?? "Closed"
              : null;
            return (
              <button
                key={d.iso}
                type="button"
                disabled={disabled}
                onClick={() => toggle(d.iso)}
                className={
                  "relative aspect-square rounded-md border text-sm transition-colors " +
                  (isSelected
                    ? "border-brand-600 bg-brand-600 text-white"
                    : isTaken
                      ? "border-stone-200/80 bg-cream-100 text-ink-400 line-through"
                      : isBlackout
                        ? "border-stone-300 bg-cream-100 bg-[repeating-linear-gradient(45deg,_rgba(120,113,108,0.18)_0,_rgba(120,113,108,0.18)_3px,_transparent_3px,_transparent_7px)] text-ink-400"
                        : isFull
                          ? "border-red-200 bg-red-50 text-red-400"
                          : isPast
                            ? "border-stone-100 text-ink-400"
                            : "border-stone-200/80 bg-white text-ink-900 hover:border-brand-400 hover:bg-brand-50")
                }
                title={
                  closedReason
                    ? `${d.iso} · ${closedReason}`
                    : isFull
                      ? `${d.iso} · full`
                      : isEvent
                        ? `${d.iso} · event`
                        : d.iso
                }
              >
                {d.day}
                {isEvent && !isBlackout && (
                  <span
                    aria-hidden
                    className={
                      "pointer-events-none absolute bottom-1 left-1/2 inline-block h-1.5 w-1.5 -translate-x-1/2 rounded-full " +
                      (isSelected ? "bg-white" : "bg-amber-500")
                    }
                  />
                )}
              </button>
            );
          })}
        </div>
      </section>

      <EventList
        events={events}
        title="Events in the next 6 weeks"
        emptyText="Nothing scheduled in this window."
        compact
      />

      <section className="card">
        <h3 className="font-semibold text-ink-900">Times</h3>
        <p className="mt-1 text-sm text-ink-500">
          Drop-off and pickup must be between 6:00 AM and 6:00 PM. Same times
          apply to every selected day.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Drop-off</span>
            <input
              type="time"
              min={EARLIEST_TIME}
              max={LATEST_TIME}
              step={900}
              value={dropOffTime}
              onChange={(e) => setDropOffTime(e.target.value)}
              className="input"
              required
            />
          </label>
          <label className="block">
            <span className="label">Pickup</span>
            <input
              type="time"
              min={EARLIEST_TIME}
              max={LATEST_TIME}
              step={900}
              value={pickupTime}
              onChange={(e) => setPickupTime(e.target.value)}
              className="input"
              required
            />
          </label>
        </div>
        {!timesValid && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Pick a drop-off and pickup between 6:00 AM and 6:00 PM. Pickup must
            be after drop-off.
          </p>
        )}
      </section>

      <section className="card">
        <h3 className="font-semibold text-ink-900">Summary</h3>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-700">Days selected</dt>
            <dd className="font-medium text-ink-900">{selectedCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-700">Covered by package</dt>
            <dd className="font-medium text-ink-900">{packageDaysUsed}</dd>
          </div>
          {dropInDaysNeeded > 0 && dropInPriceCents && (
            <div className="flex justify-between">
              <dt className="text-ink-700">Drop-in days × {dropInDaysNeeded}</dt>
              <dd className="font-medium text-ink-900">
                {formatMoney(dropInTotalCents)}
              </dd>
            </div>
          )}
          <div className="flex justify-between border-t border-stone-200/80 pt-2">
            <dt className="font-semibold text-ink-900">Due today</dt>
            <dd className="font-semibold text-ink-900">
              {formatMoney(dropInTotalCents)}
            </dd>
          </div>
        </dl>
      </section>

      <button
        type="submit"
        disabled={
          selectedCount === 0 ||
          !dogId ||
          dogBlocked ||
          !timesValid ||
          (dropInDaysNeeded > 0 && !dropInPriceCents)
        }
        className="btn-primary w-full"
      >
        {dropInDaysNeeded > 0
          ? `Continue to checkout (${formatMoney(dropInTotalCents)})`
          : "Confirm booking"}
      </button>
    </form>
  );
}

function generateDays(startISO: string, count: number) {
  const [y, m, d] = startISO.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const dow = start.getDay();
  const padding = Array.from({ length: dow });
  const list: { iso: string; day: number }[] = [];
  for (let i = 0; i < count; i++) {
    const cur = new Date(y, m - 1, d + i);
    const yy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, "0");
    const dd = String(cur.getDate()).padStart(2, "0");
    list.push({ iso: `${yy}-${mm}-${dd}`, day: cur.getDate() });
  }
  return { padding, list };
}

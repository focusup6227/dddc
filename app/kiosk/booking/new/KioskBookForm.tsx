"use client";

import { useMemo, useState } from "react";
import type { Dog } from "@/lib/supabase/types";
import { formatMoney } from "@/lib/format";
import {
  DEFAULT_DROP_OFF_TIME,
  DEFAULT_PICKUP_TIME,
  EARLIEST_TIME,
  LATEST_TIME,
} from "@/lib/hours";
import { kioskCreateBooking } from "../../actions";

export function KioskBookForm({
  customerId,
  dogs,
  daysRemaining,
  dropInPriceCents,
  existingBookings,
  fullDates,
  startDate,
}: {
  customerId: string;
  dogs: Dog[];
  daysRemaining: number;
  dropInPriceCents: number | null;
  existingBookings: { dog_id: string; service_date: string }[];
  fullDates: string[];
  startDate: string;
}) {
  const [dogId, setDogId] = useState(dogs[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dropOffTime, setDropOffTime] = useState(DEFAULT_DROP_OFF_TIME);
  const [pickupTime, setPickupTime] = useState(DEFAULT_PICKUP_TIME);
  const timesValid =
    dropOffTime >= EARLIEST_TIME &&
    dropOffTime <= LATEST_TIME &&
    pickupTime >= EARLIEST_TIME &&
    pickupTime <= LATEST_TIME &&
    pickupTime > dropOffTime;

  const taken = useMemo(() => {
    const s = new Set<string>();
    for (const b of existingBookings) if (b.dog_id === dogId) s.add(b.service_date);
    return s;
  }, [existingBookings, dogId]);
  const full = useMemo(() => new Set(fullDates), [fullDates]);

  const days = useMemo(() => generateDays(startDate, 42), [startDate]);

  function toggle(date: string) {
    if (taken.has(date)) return;
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
  const overlapsFull = Array.from(selected).some((d) => full.has(d));

  return (
    <form action={kioskCreateBooking} className="mt-2 space-y-6">
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="dog_id" value={dogId} />
      <input type="hidden" name="service_dates" value={Array.from(selected).sort().join(",")} />
      <input type="hidden" name="drop_off_time" value={dropOffTime} />
      <input type="hidden" name="pickup_time" value={pickupTime} />

      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-ink-900">Dog</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {dogs.map((d) => (
            <button
              type="button"
              key={d.id}
              onClick={() => {
                setDogId(d.id);
                setSelected(new Set());
              }}
              className={
                "rounded-full border px-4 py-2 text-base " +
                (dogId === d.id
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-stone-300 text-ink-700 hover:bg-stone-50")
              }
            >
              {d.name}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-ink-900">Dates</h3>
        <p className="mt-1 text-sm text-ink-500">
          Red days are at capacity — staff can still book them, but expect a busy day.
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
            const disabled = isTaken || isPast;
            return (
              <button
                key={d.iso}
                type="button"
                disabled={disabled}
                onClick={() => toggle(d.iso)}
                className={
                  "aspect-square rounded-md border text-sm transition-colors " +
                  (isSelected
                    ? isFull
                      ? "border-red-600 bg-red-600 text-white"
                      : "border-brand-600 bg-brand-600 text-white"
                    : isTaken
                      ? "border-stone-200 bg-stone-100 text-ink-400 line-through"
                      : isPast
                        ? "border-stone-100 text-ink-400"
                        : isFull
                          ? "border-red-200 bg-red-50 text-red-700 hover:border-red-400"
                          : "border-stone-200 bg-white text-ink-900 hover:border-brand-400 hover:bg-brand-50")
                }
                title={isFull ? `${d.iso} · full` : d.iso}
              >
                {d.day}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-ink-900">Times</h3>
        <p className="mt-1 text-sm text-ink-500">
          Drop-off and pickup must be between 6:00 AM and 6:00 PM.
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
            Pickup must be after drop-off and both within 6 AM–6 PM.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-ink-900">Summary</h3>
        <dl className="mt-3 space-y-1 text-base">
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
              <dt className="text-ink-700">Drop-in × {dropInDaysNeeded}</dt>
              <dd className="font-medium text-ink-900">{formatMoney(dropInTotalCents)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-stone-200 pt-2 text-lg">
            <dt className="font-semibold text-ink-900">Due now</dt>
            <dd className="font-semibold text-ink-900">
              {formatMoney(dropInTotalCents)}
            </dd>
          </div>
        </dl>
        {overlapsFull && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            At least one selected day is already at capacity. Continue only if you&apos;re
            sure you have room.
          </p>
        )}
      </section>

      <button
        type="submit"
        disabled={
          selectedCount === 0 ||
          !dogId ||
          !timesValid ||
          (dropInDaysNeeded > 0 && !dropInPriceCents)
        }
        className="w-full rounded-2xl bg-brand-600 px-6 py-5 text-xl font-bold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
      >
        {dropInDaysNeeded > 0
          ? `Continue to payment (${formatMoney(dropInTotalCents)})`
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

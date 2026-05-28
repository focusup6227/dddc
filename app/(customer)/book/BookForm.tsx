"use client";

import { useMemo, useState } from "react";
import type { Dog } from "@/lib/supabase/types";
import { formatMoney } from "@/lib/format";
import { createBooking } from "./actions";

export function BookForm({
  dogs,
  daysRemaining,
  dropInPriceCents,
  existingBookings,
  startDate,
}: {
  dogs: Dog[];
  daysRemaining: number;
  dropInPriceCents: number | null;
  existingBookings: { dog_id: string; service_date: string }[];
  startDate: string;
}) {
  const [dogId, setDogId] = useState(dogs[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const taken = useMemo(() => {
    const s = new Set<string>();
    for (const b of existingBookings) {
      if (b.dog_id === dogId) s.add(b.service_date);
    }
    return s;
  }, [existingBookings, dogId]);

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

  return (
    <form action={createBooking} className="mt-6 space-y-6">
      <input type="hidden" name="dog_id" value={dogId} />
      <input
        type="hidden"
        name="service_dates"
        value={Array.from(selected).sort().join(",")}
      />

      <section className="card">
        <h3 className="font-semibold text-stone-900">Dog</h3>
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
                "rounded-full border px-3 py-1.5 text-sm " +
                (dogId === d.id
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-stone-300 text-stone-700 hover:bg-stone-50")
              }
            >
              {d.name}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="font-semibold text-stone-900">Dates</h3>
        <p className="mt-1 text-sm text-stone-500">
          Pick the days you&apos;d like to drop off. Greyed-out days are already booked.
        </p>
        <div className="mt-4 grid grid-cols-7 gap-1 text-xs">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="py-1 text-center font-medium text-stone-500">
              {d}
            </div>
          ))}
          {days.padding.map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {days.list.map((d) => {
            const isTaken = taken.has(d.iso);
            const isSelected = selected.has(d.iso);
            const isPast = d.iso < startDate;
            return (
              <button
                key={d.iso}
                type="button"
                disabled={isTaken || isPast}
                onClick={() => toggle(d.iso)}
                className={
                  "aspect-square rounded-md border text-sm transition-colors " +
                  (isSelected
                    ? "border-brand-600 bg-brand-600 text-white"
                    : isTaken
                      ? "border-stone-200 bg-stone-100 text-stone-400 line-through"
                      : isPast
                        ? "border-stone-100 text-stone-300"
                        : "border-stone-200 bg-white text-stone-800 hover:border-brand-400 hover:bg-brand-50")
                }
                title={d.iso}
              >
                {d.day}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h3 className="font-semibold text-stone-900">Summary</h3>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-600">Days selected</dt>
            <dd className="font-medium text-stone-900">{selectedCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-600">Covered by package</dt>
            <dd className="font-medium text-stone-900">{packageDaysUsed}</dd>
          </div>
          {dropInDaysNeeded > 0 && dropInPriceCents && (
            <div className="flex justify-between">
              <dt className="text-stone-600">Drop-in days × {dropInDaysNeeded}</dt>
              <dd className="font-medium text-stone-900">
                {formatMoney(dropInTotalCents)}
              </dd>
            </div>
          )}
          <div className="flex justify-between border-t border-stone-200 pt-2">
            <dt className="font-semibold text-stone-900">Due today</dt>
            <dd className="font-semibold text-stone-900">
              {formatMoney(dropInTotalCents)}
            </dd>
          </div>
        </dl>
      </section>

      <button
        type="submit"
        disabled={selectedCount === 0 || !dogId || (dropInDaysNeeded > 0 && !dropInPriceCents)}
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

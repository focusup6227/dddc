"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Dog, VaccineType } from "@/lib/supabase/types";
import { formatMoney } from "@/lib/format";
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
}: {
  dogs: Dog[];
  daysRemaining: number;
  dropInPriceCents: number | null;
  existingBookings: { dog_id: string; service_date: string }[];
  startDate: string;
  fullDates: string[];
  vaccineBlocks: Record<string, VaccineType[]>;
  vaccineLabels: Record<VaccineType, string>;
}) {
  const firstReady = dogs.find((d) => !vaccineBlocks[d.id]?.length);
  const [dogId, setDogId] = useState(firstReady?.id ?? dogs[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const days = useMemo(() => generateDays(startDate, 42), [startDate]);

  function toggle(date: string) {
    if (taken.has(date) || full.has(date)) return;
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
                      ? "border-stone-200 bg-stone-50 text-stone-500"
                      : "border-stone-300 text-stone-700 hover:bg-stone-50")
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
            const isFull = full.has(d.iso);
            const isSelected = selected.has(d.iso);
            const isPast = d.iso < startDate;
            const disabled = isTaken || isFull || isPast;
            return (
              <button
                key={d.iso}
                type="button"
                disabled={disabled}
                onClick={() => toggle(d.iso)}
                className={
                  "aspect-square rounded-md border text-sm transition-colors " +
                  (isSelected
                    ? "border-brand-600 bg-brand-600 text-white"
                    : isTaken
                      ? "border-stone-200 bg-stone-100 text-stone-400 line-through"
                      : isFull
                        ? "border-red-200 bg-red-50 text-red-400"
                        : isPast
                          ? "border-stone-100 text-stone-300"
                          : "border-stone-200 bg-white text-stone-800 hover:border-brand-400 hover:bg-brand-50")
                }
                title={isFull ? `${d.iso} · full` : d.iso}
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
        disabled={
          selectedCount === 0 ||
          !dogId ||
          dogBlocked ||
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

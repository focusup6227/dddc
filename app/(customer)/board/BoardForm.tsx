"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Dog, Event, VaccineType } from "@/lib/supabase/types";
import { addDays, formatDateShort, formatMoney } from "@/lib/format";
import {
  DEFAULT_DROP_OFF_TIME,
  DEFAULT_PICKUP_TIME,
  EARLIEST_TIME,
  LATEST_TIME,
} from "@/lib/hours";
import { EventList } from "@/components/EventList";
import { createBoarding } from "./actions";

export function BoardForm({
  dogs,
  rateCents,
  dogWashPriceCents,
  startDate,
  fullNights,
  vaccineBlocks,
  vaccineLabels,
  events,
  blackoutNights,
}: {
  dogs: Dog[];
  rateCents: number;
  dogWashPriceCents: number;
  startDate: string;
  fullNights: string[];
  vaccineBlocks: Record<string, VaccineType[]>;
  vaccineLabels: Record<VaccineType, string>;
  events: Event[];
  blackoutNights: string[];
}) {
  const firstReady = dogs.find((d) => !vaccineBlocks[d.id]?.length);
  const [dogId, setDogId] = useState(firstReady?.id ?? dogs[0]?.id ?? "");
  const [checkIn, setCheckIn] = useState(startDate);
  const [checkOut, setCheckOut] = useState(addDays(startDate, 1));
  const [dropOffTime, setDropOffTime] = useState(DEFAULT_DROP_OFF_TIME);
  const [pickupTime, setPickupTime] = useState(DEFAULT_PICKUP_TIME);
  const [dogWash, setDogWash] = useState(false);
  const timesValid =
    dropOffTime >= EARLIEST_TIME &&
    dropOffTime <= LATEST_TIME &&
    pickupTime >= EARLIEST_TIME &&
    pickupTime <= LATEST_TIME;
  const blockedMissing = vaccineBlocks[dogId] ?? [];
  const dogBlocked = blockedMissing.length > 0;

  const fullSet = useMemo(() => new Set(fullNights), [fullNights]);
  const blackoutSet = useMemo(
    () => new Set(blackoutNights),
    [blackoutNights],
  );

  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);
  const eventsInStay = useMemo(() => {
    if (nights.length === 0) return [];
    const first = nights[0];
    const last = nights[nights.length - 1];
    return events.filter((ev) => ev.start_date <= last && ev.end_date >= first);
  }, [events, nights]);
  const overlappingFull = useMemo(
    () => nights.filter((n) => fullSet.has(n)),
    [nights, fullSet],
  );
  const overlappingBlackouts = useMemo(
    () => nights.filter((n) => blackoutSet.has(n)),
    [nights, blackoutSet],
  );

  const washCents = dogWash ? dogWashPriceCents : 0;
  const totalCents = nights.length * rateCents + washCents;
  const validRange = nights.length > 0;
  const hasFullNights = overlappingFull.length > 0;
  const hasBlackouts = overlappingBlackouts.length > 0;
  const canSubmit =
    !!dogId &&
    validRange &&
    !hasFullNights &&
    !hasBlackouts &&
    !dogBlocked &&
    timesValid;

  return (
    <form action={createBoarding} className="mt-6 space-y-6">
      <input type="hidden" name="dog_id" value={dogId} />
      <input type="hidden" name="check_in" value={checkIn} />
      <input type="hidden" name="check_out" value={checkOut} />
      <input type="hidden" name="drop_off_time" value={dropOffTime} />
      <input type="hidden" name="pickup_time" value={pickupTime} />
      <input type="hidden" name="dog_wash" value={dogWash ? "1" : "0"} />

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
                onClick={() => setDogId(d.id)}
                className={
                  "rounded-full border px-3 py-1.5 text-sm " +
                  (isSelected
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : isBlocked
                      ? "border-stone-200 bg-cream-50 text-ink-500"
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
              Needs: {blockedMissing.map((k) => vaccineLabels[k]).join(", ")}.
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
          Drop off on the check-in date; pick up on the check-out date. You pay
          for each night in between.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Check-in</span>
            <input
              type="date"
              min={startDate}
              value={checkIn}
              onChange={(e) => {
                const v = e.target.value;
                setCheckIn(v);
                if (v >= checkOut) setCheckOut(addDays(v, 1));
              }}
              className="input"
              required
            />
          </label>
          <label className="block">
            <span className="label">Check-out</span>
            <input
              type="date"
              min={addDays(checkIn, 1)}
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="input"
              required
            />
          </label>
        </div>
        {hasBlackouts && (
          <div className="mt-3 rounded-md border border-stone-300 bg-cream-100 px-3 py-2 text-sm text-ink-900">
            We&apos;re closed on{" "}
            {overlappingBlackouts.map((n) => formatDateShort(n)).join(", ")}.
            Please pick a different range.
          </div>
        )}
        {eventsInStay.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Your stay overlaps:{" "}
            {eventsInStay.map((e) => e.title).join(", ")} — see details below.
          </div>
        )}
      </section>

      <EventList
        events={events}
        title="Events in the next 60 days"
        emptyText="Nothing scheduled in this window."
        compact
      />

      <section className="card">
        <h3 className="font-semibold text-ink-900">Times</h3>
        <p className="mt-1 text-sm text-ink-500">
          Drop-off on check-in day, pickup on check-out day. Both must be
          between 6:00 AM and 6:00 PM.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Drop-off time</span>
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
            <span className="label">Pickup time</span>
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
            Drop-off and pickup must be between 6:00 AM and 6:00 PM.
          </p>
        )}
      </section>

      <section className="card">
        <h3 className="font-semibold text-ink-900">Add-ons</h3>
        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3">
          <span>
            <span className="font-medium text-ink-900">Dog wash</span>
            <span className="block text-sm text-ink-500">
              A bath before pickup — {formatMoney(dogWashPriceCents)} one-time.
            </span>
          </span>
          <input
            type="checkbox"
            checked={dogWash}
            onChange={(e) => setDogWash(e.target.checked)}
            className="h-5 w-5 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
          />
        </label>
      </section>

      <section className="card">
        <h3 className="font-semibold text-ink-900">Summary</h3>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-700">Nights</dt>
            <dd className="font-medium text-ink-900">{nights.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-700">Rate</dt>
            <dd className="font-medium text-ink-900">
              {formatMoney(rateCents)} / night
            </dd>
          </div>
          {dogWash && (
            <div className="flex justify-between">
              <dt className="text-ink-700">Dog wash</dt>
              <dd className="font-medium text-ink-900">
                {formatMoney(washCents)}
              </dd>
            </div>
          )}
          <div className="flex justify-between border-t border-stone-200 pt-2">
            <dt className="font-semibold text-ink-900">Due today</dt>
            <dd className="font-semibold text-ink-900">
              {formatMoney(totalCents)}
            </dd>
          </div>
        </dl>
        {hasFullNights && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Sorry — these nights are full:{" "}
            {overlappingFull.map((n) => formatDateShort(n)).join(", ")}. Try a
            different range.
          </p>
        )}
      </section>

      <button type="submit" disabled={!canSubmit} className="btn-primary w-full">
        {validRange
          ? `Continue to checkout (${formatMoney(totalCents)})`
          : "Pick check-in and check-out"}
      </button>
    </form>
  );
}

function nightsBetween(checkIn: string, checkOut: string): string[] {
  if (!checkIn || !checkOut || checkOut <= checkIn) return [];
  const result: string[] = [];
  let cur = checkIn;
  // Cap to 30 nights for sanity.
  for (let i = 0; i < 30 && cur < checkOut; i++) {
    result.push(cur);
    cur = addDays(cur, 1);
  }
  return result;
}

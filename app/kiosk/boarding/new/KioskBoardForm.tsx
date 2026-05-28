"use client";

import { useMemo, useState } from "react";
import type { Dog } from "@/lib/supabase/types";
import { addDays, formatDateShort, formatMoney } from "@/lib/format";
import {
  DEFAULT_DROP_OFF_TIME,
  DEFAULT_PICKUP_TIME,
  EARLIEST_TIME,
  LATEST_TIME,
} from "@/lib/hours";
import { kioskCreateBoarding } from "@/app/kiosk/actions";

export function KioskBoardForm({
  customerId,
  dogs,
  rateCents,
  startDate,
  fullNights,
}: {
  customerId: string;
  dogs: Dog[];
  rateCents: number;
  startDate: string;
  fullNights: string[];
}) {
  const [dogId, setDogId] = useState(dogs[0]?.id ?? "");
  const [checkIn, setCheckIn] = useState(startDate);
  const [checkOut, setCheckOut] = useState(addDays(startDate, 1));
  const [dropOffTime, setDropOffTime] = useState(DEFAULT_DROP_OFF_TIME);
  const [pickupTime, setPickupTime] = useState(DEFAULT_PICKUP_TIME);
  const timesValid =
    dropOffTime >= EARLIEST_TIME &&
    dropOffTime <= LATEST_TIME &&
    pickupTime >= EARLIEST_TIME &&
    pickupTime <= LATEST_TIME;

  const fullSet = useMemo(() => new Set(fullNights), [fullNights]);

  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);
  const overlappingFull = useMemo(
    () => nights.filter((n) => fullSet.has(n)),
    [nights, fullSet],
  );

  const totalCents = nights.length * rateCents;
  const validRange = nights.length > 0;

  return (
    <form action={kioskCreateBoarding} className="space-y-6">
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="dog_id" value={dogId} />
      <input type="hidden" name="check_in" value={checkIn} />
      <input type="hidden" name="check_out" value={checkOut} />
      <input type="hidden" name="drop_off_time" value={dropOffTime} />
      <input type="hidden" name="pickup_time" value={pickupTime} />

      <section className="card">
        <h3 className="font-semibold text-ink-900">Dog</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {dogs.map((d) => (
            <button
              type="button"
              key={d.id}
              onClick={() => setDogId(d.id)}
              className={
                "rounded-full border px-3 py-1.5 text-sm " +
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

      <section className="card">
        <h3 className="font-semibold text-ink-900">Dates</h3>
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
      </section>

      <section className="card">
        <h3 className="font-semibold text-ink-900">Times</h3>
        <p className="mt-1 text-sm text-ink-500">
          Drop-off on check-in day, pickup on check-out day. Both 6 AM–6 PM.
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
          <div className="flex justify-between border-t border-stone-200 pt-2">
            <dt className="font-semibold text-ink-900">Total</dt>
            <dd className="font-semibold text-ink-900">
              {formatMoney(totalCents)}
            </dd>
          </div>
        </dl>
        {overlappingFull.length > 0 && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            These nights are at capacity — staff can still book past the
            limit:{" "}
            {overlappingFull.map((n) => formatDateShort(n)).join(", ")}
          </p>
        )}
      </section>

      <button
        type="submit"
        disabled={!validRange || !dogId || !timesValid}
        className="btn-primary w-full"
      >
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
  for (let i = 0; i < 30 && cur < checkOut; i++) {
    result.push(cur);
    cur = addDays(cur, 1);
  }
  return result;
}

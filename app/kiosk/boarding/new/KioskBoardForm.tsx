"use client";

import { useMemo, useState } from "react";
import type { Dog } from "@/lib/supabase/types";
import { addDays, formatDateShort, formatMoney } from "@/lib/format";
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

      <section className="card">
        <h3 className="font-semibold text-stone-900">Dog</h3>
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
        <h3 className="font-semibold text-stone-900">Summary</h3>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-600">Nights</dt>
            <dd className="font-medium text-stone-900">{nights.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-600">Rate</dt>
            <dd className="font-medium text-stone-900">
              {formatMoney(rateCents)} / night
            </dd>
          </div>
          <div className="flex justify-between border-t border-stone-200 pt-2">
            <dt className="font-semibold text-stone-900">Total</dt>
            <dd className="font-semibold text-stone-900">
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

      <button type="submit" disabled={!validRange || !dogId} className="btn-primary w-full">
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

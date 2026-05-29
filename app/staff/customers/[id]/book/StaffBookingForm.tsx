"use client";

import { useState } from "react";

type DogOption = { id: string; name: string };

export function StaffBookingForm({
  action,
  customerId,
  dogs,
  preselectDog,
  tomorrow,
}: {
  action: (formData: FormData) => Promise<void>;
  customerId: string;
  dogs: DogOption[];
  preselectDog?: string;
  tomorrow: string;
}) {
  const [kind, setKind] = useState<"daycare" | "boarding">("daycare");
  const dayAfter = addOneDay(tomorrow);

  return (
    <form action={action} className="mt-6 space-y-6">
      <input type="hidden" name="customer_id" value={customerId} />

      <section className="card space-y-4">
        <div>
          <label htmlFor="dog_id" className="label">
            Dog
          </label>
          <select
            id="dog_id"
            name="dog_id"
            defaultValue={preselectDog ?? dogs[0]?.id}
            className="input"
            required
          >
            {dogs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="label">Service</span>
          <div className="mt-1 flex gap-2">
            <ToggleButton
              active={kind === "daycare"}
              onClick={() => setKind("daycare")}
              label="Day care"
            />
            <ToggleButton
              active={kind === "boarding"}
              onClick={() => setKind("boarding")}
              label="Boarding"
            />
          </div>
          <input type="hidden" name="service_kind" value={kind} />
        </div>

        {kind === "daycare" ? (
          <div>
            <label htmlFor="service_date" className="label">
              Day
            </label>
            <input
              id="service_date"
              name="service_date"
              type="date"
              defaultValue={tomorrow}
              className="input"
              required
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="check_in" className="label">
                Check-in
              </label>
              <input
                id="check_in"
                name="check_in"
                type="date"
                defaultValue={tomorrow}
                className="input"
                required
              />
            </div>
            <div>
              <label htmlFor="check_out" className="label">
                Check-out
              </label>
              <input
                id="check_out"
                name="check_out"
                type="date"
                defaultValue={dayAfter}
                className="input"
                required
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="drop_off_time" className="label">
              Drop-off
            </label>
            <input
              id="drop_off_time"
              name="drop_off_time"
              type="time"
              min="06:00"
              max="18:00"
              defaultValue="08:00"
              className="input"
              required
            />
          </div>
          <div>
            <label htmlFor="pickup_time" className="label">
              Pickup
            </label>
            <input
              id="pickup_time"
              name="pickup_time"
              type="time"
              min="06:00"
              max="18:00"
              defaultValue="17:00"
              className="input"
              required
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <button type="submit" className="btn-primary">
          Create booking
        </button>
      </div>
    </form>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-xl border border-brand-600 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700"
          : "rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-ink-600 hover:bg-cream-50"
      }
    >
      {label}
    </button>
  );
}

function addOneDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

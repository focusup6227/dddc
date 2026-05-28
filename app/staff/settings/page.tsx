import { requireFullStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getBoardingRateCents,
  getMaxDogsPerDay,
  getMaxDogsPerNight,
} from "@/lib/settings";
import { StaffSubNav } from "@/components/StaffSubNav";
import { ToastNotifier } from "@/components/ToastNotifier";
import { saveSettings } from "./actions";

const SUBNAV = [
  { href: "/staff/settings", label: "General", active: true },
  { href: "/staff/packages", label: "Packages" },
  { href: "/staff/coupons", label: "Coupons" },
  { href: "/staff/events", label: "Events" },
];

const TOASTS = [
  { param: "saved", message: "Settings saved." },
  { param: "error", tone: "error" as const },
];

export const dynamic = "force-dynamic";

export default async function StaffSettingsPage() {
  await requireFullStaff();
  const [maxDay, maxNight, boardingCents] = await Promise.all([
    getMaxDogsPerDay(),
    getMaxDogsPerNight(),
    getBoardingRateCents(),
  ]);
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("settings")
    .select("*")
    .order("key");

  return (
    <div className="max-w-xl space-y-6 animate-fade-up">
      <StaffSubNav items={SUBNAV} />
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900">
          Settings
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Capacity, pricing, and operational defaults.
        </p>
      </div>

      <ToastNotifier toasts={TOASTS} />

      <form action={saveSettings} className="card space-y-4">
        <div>
          <label htmlFor="max_dogs_per_day" className="label">
            Daycare capacity (dogs per day)
          </label>
          <input
            id="max_dogs_per_day"
            name="max_dogs_per_day"
            type="number"
            min={1}
            max={500}
            defaultValue={maxDay}
            required
            className="input"
          />
          <p className="mt-1 text-xs text-ink-500">
            New customer daycare bookings are blocked once a day reaches this
            many dogs. Staff can still book past the limit from the kiosk.
          </p>
        </div>
        <div>
          <label htmlFor="max_dogs_per_night" className="label">
            Boarding capacity (dogs per night)
          </label>
          <input
            id="max_dogs_per_night"
            name="max_dogs_per_night"
            type="number"
            min={1}
            max={500}
            defaultValue={maxNight}
            required
            className="input"
          />
          <p className="mt-1 text-xs text-ink-500">
            New boarding bookings are blocked once a night reaches this many
            dogs. Tracked separately from daycare capacity.
          </p>
        </div>
        <div>
          <label htmlFor="boarding_rate_dollars" className="label">
            Boarding rate ($ / night)
          </label>
          <input
            id="boarding_rate_dollars"
            name="boarding_rate_dollars"
            type="number"
            min={1}
            max={10000}
            step="0.01"
            defaultValue={(boardingCents / 100).toFixed(2)}
            required
            className="input"
          />
          <p className="mt-1 text-xs text-ink-500">
            Per dog, per night. Existing bookings are charged the rate that was
            in effect when they were created.
          </p>
        </div>
        <button type="submit" className="btn-primary">
          Save
        </button>
      </form>

      <details className="text-xs text-ink-500">
        <summary className="cursor-pointer">All settings</summary>
        <pre className="mt-2 overflow-auto rounded-md bg-stone-100 p-3 text-ink-700">
          {JSON.stringify(rows, null, 2)}
        </pre>
      </details>
    </div>
  );
}

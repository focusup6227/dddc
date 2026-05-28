import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getBoardingRateCents,
  getMaxDogsPerDay,
  getMaxDogsPerNight,
} from "@/lib/settings";
import { StaffSubNav } from "@/components/StaffSubNav";
import { saveSettings } from "./actions";

const SUBNAV = [
  { href: "/staff/settings", label: "General", active: true },
  { href: "/staff/packages", label: "Packages" },
  { href: "/staff/coupons", label: "Coupons" },
  { href: "/staff/events", label: "Events" },
];

export const dynamic = "force-dynamic";

export default async function StaffSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
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
    <div className="max-w-xl space-y-6">
      <StaffSubNav items={SUBNAV} />
      <h1 className="text-2xl font-bold text-stone-900">Settings</h1>

      {params.saved && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
          Saved.
        </p>
      )}
      {params.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
          {params.error}
        </p>
      )}

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
          <p className="mt-1 text-xs text-stone-500">
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
          <p className="mt-1 text-xs text-stone-500">
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
          <p className="mt-1 text-xs text-stone-500">
            Per dog, per night. Existing bookings are charged the rate that was
            in effect when they were created.
          </p>
        </div>
        <button type="submit" className="btn-primary">
          Save
        </button>
      </form>

      <details className="text-xs text-stone-500">
        <summary className="cursor-pointer">All settings</summary>
        <pre className="mt-2 overflow-auto rounded-md bg-stone-100 p-3 text-stone-700">
          {JSON.stringify(rows, null, 2)}
        </pre>
      </details>
    </div>
  );
}

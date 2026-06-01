import { todayISO } from "@/lib/format";
import { joinWaitlist } from "@/app/(customer)/bookings/actions";
import type { ServiceKind } from "@/lib/supabase/types";

/**
 * "The day's full — get in line." A compact, collapsible form for joining the
 * waitlist, shown under the booking calendar. Daycare waits on a single day;
 * boarding waits on a check-in → check-out span. When a spot frees up the
 * first person in line is emailed and held the spot for a short window.
 */
export function WaitlistJoinForm({
  kind,
  dogs,
}: {
  kind: ServiceKind;
  dogs: { id: string; name: string }[];
}) {
  if (dogs.length === 0) return null;
  const today = todayISO();
  const isBoarding = kind === "boarding";

  return (
    <details className="mt-6 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-soft">
      <summary className="cursor-pointer list-none px-5 py-4 font-display text-base font-semibold text-ink-900 hover:bg-cream-50">
        {isBoarding ? "Nights full?" : "Day full?"} Join the waitlist →
      </summary>
      <form
        action={joinWaitlist}
        className="space-y-4 border-t border-stone-200/80 p-5"
      >
        <input type="hidden" name="kind" value={kind} />
        <p className="text-sm text-ink-500">
          We&apos;ll email you the moment a spot opens and hold it for{" "}
          {isBoarding ? "your stay" : "the day"} — first come, first served down
          the line.
        </p>
        <label className="block">
          <span className="label">Dog</span>
          <select name="dog_id" className="input" required>
            {dogs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {isBoarding ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Check-in</span>
              <input
                type="date"
                name="check_in"
                min={today}
                className="input"
                required
              />
            </label>
            <label className="block">
              <span className="label">Check-out</span>
              <input
                type="date"
                name="check_out"
                min={today}
                className="input"
                required
              />
            </label>
          </div>
        ) : (
          <label className="block">
            <span className="label">Day</span>
            <input
              type="date"
              name="service_date"
              min={today}
              className="input"
              required
            />
          </label>
        )}
        <button type="submit" className="btn-primary w-full">
          Join the waitlist
        </button>
      </form>
    </details>
  );
}

import { createServiceClient } from "@/lib/supabase/server";
import type {
  CustomerPackage,
  Package,
  RecurringBooking,
} from "@/lib/supabase/types";
import { addDays, todayISO } from "@/lib/format";
import { getFullDates } from "@/lib/settings";
import { getBlackoutDates } from "@/lib/blackouts.server";
import { consumePackageDay } from "@/lib/packageAllocation";

const HORIZON_DAYS = 28;

/**
 * Materialize concrete daycare bookings for each active recurring schedule
 * owned by the customer, up to HORIZON_DAYS ahead. Idempotent — the
 * (dog_id, service_date) unique constraint absorbs duplicate inserts.
 *
 * Behavior:
 *   - Skips blackout days and at-capacity days.
 *   - Allocates available package days FIFO; falls back to unpaid drop-in.
 *   - Honors the schedule's end_date if set, and stops past dog or schedule
 *     being inactive.
 */
export async function materializeForCustomer(customerId: string): Promise<{
  created: number;
}> {
  const svc = createServiceClient();
  const { data: schedules } = await svc
    .from("recurring_bookings")
    .select("*")
    .eq("customer_id", customerId)
    .eq("active", true);
  const list = (schedules ?? []) as RecurringBooking[];
  if (list.length === 0) return { created: 0 };

  const today = todayISO();
  const horizon = addDays(today, HORIZON_DAYS);

  // Gather candidate (dog_id, date) tuples.
  type Cand = { schedule: RecurringBooking; date: string };
  const candidates: Cand[] = [];
  for (const s of list) {
    let cur = s.start_date > today ? s.start_date : today;
    const end = s.end_date && s.end_date < horizon ? s.end_date : horizon;
    while (cur <= end) {
      const dow = weekdayOf(cur);
      if (s.weekdays.includes(dow)) candidates.push({ schedule: s, date: cur });
      cur = addDays(cur, 1);
    }
  }
  if (candidates.length === 0) return { created: 0 };

  // Filter out dates that already have a booking for the same dog.
  const dogIds = Array.from(new Set(candidates.map((c) => c.schedule.dog_id)));
  const dates = Array.from(new Set(candidates.map((c) => c.date)));
  const minDate = dates.reduce((a, b) => (a < b ? a : b));
  const maxDate = dates.reduce((a, b) => (a > b ? a : b));
  const { data: existingRows } = await svc
    .from("bookings")
    .select("dog_id, service_date")
    .in("dog_id", dogIds)
    .gte("service_date", minDate)
    .lte("service_date", maxDate)
    .neq("status", "canceled");
  const existing = new Set(
    (existingRows ?? []).map((r) => `${r.dog_id}|${r.service_date}`),
  );

  // Capacity and blackout filters.
  const [fullDates, blackoutDates] = await Promise.all([
    getFullDates(dates, "daycare"),
    getBlackoutDates(minDate, maxDate, "daycare"),
  ]);

  // Verify dogs are still active and owned by the customer.
  const { data: dogRows } = await svc
    .from("dogs")
    .select("id, owner_id, active")
    .in("id", dogIds);
  const dogOk = new Set(
    (dogRows ?? [])
      .filter((d) => d.owner_id === customerId && d.active)
      .map((d) => d.id),
  );

  // Pull paid packages with remaining days, FIFO.
  const { data: pkgRows } = await svc
    .from("customer_packages")
    .select("*")
    .eq("customer_id", customerId)
    .eq("payment_status", "paid")
    .gt("days_remaining", 0)
    .order("created_at");
  const packages = (pkgRows ?? []) as CustomerPackage[];

  // Drop-in price for any candidate that can't be covered by a package.
  let dropInPriceCents: number | null = null;
  {
    const { data: dropInPkg } = await svc
      .from("packages")
      .select("*")
      .eq("active", true)
      .eq("days_included", 1)
      .order("price_cents")
      .limit(1)
      .maybeSingle<Package>();
    dropInPriceCents = dropInPkg?.price_cents ?? null;
  }

  // Sort candidates by date so package days go to the earliest occurrences.
  candidates.sort((a, b) => a.date.localeCompare(b.date));

  let created = 0;
  for (const c of candidates) {
    if (!dogOk.has(c.schedule.dog_id)) continue;
    if (existing.has(`${c.schedule.dog_id}|${c.date}`)) continue;
    if (fullDates.has(c.date)) continue;
    if (blackoutDates.has(c.date)) continue;

    // Consume up to a full day from packages (fractional balances allowed); the
    // uncovered remainder, if any, is an unpaid drop-in. Snapshot first so we
    // can roll back the in-memory consumption if the insert is skipped.
    const before = packages.map((p) => p.days_remaining);
    const { chargeFraction, consumed } = consumePackageDay(packages);
    const restore = () => {
      packages.forEach((p, i) => (p.days_remaining = before[i]));
    };

    const insertBase = {
      customer_id: customerId,
      dog_id: c.schedule.dog_id,
      service_date: c.date,
      service_end_date: addDays(c.date, 1),
      drop_off_time: c.schedule.drop_off_time,
      pickup_time: c.schedule.pickup_time,
      status: "reserved" as const,
    };

    let insertRow: Record<string, unknown>;
    if (chargeFraction === 0) {
      insertRow = {
        ...insertBase,
        payment_kind: "package",
        customer_package_id: consumed[0]!.id,
        package_days_used: 1,
        payment_status: "paid",
      };
    } else if (dropInPriceCents !== null) {
      insertRow = {
        ...insertBase,
        payment_kind: "drop_in",
        customer_package_id: consumed[0]?.id ?? null,
        package_days_used: Math.round((1 - chargeFraction) * 10) / 10,
        unit_price_cents: Math.round(dropInPriceCents * chargeFraction),
        payment_status: "unpaid",
      };
    } else {
      // No drop-in price configured — can't price the cash remainder. Restore
      // any consumed fraction and skip rather than insert an unpriced row.
      restore();
      continue;
    }

    const { error: insErr } = await svc.from("bookings").insert(insertRow);
    if (insErr) {
      restore();
      if (insErr.message.toLowerCase().includes("duplicate")) continue;
      // Skip on other errors so one bad row doesn't abort the whole pass.
      console.error("recurring materialize insert failed:", insErr);
      continue;
    }
    created += 1;

    // Persist whatever package balances this day changed.
    for (let i = 0; i < packages.length; i++) {
      if (packages[i].days_remaining !== before[i]) {
        await svc
          .from("customer_packages")
          .update({ days_remaining: packages[i].days_remaining })
          .eq("id", packages[i].id);
      }
    }
  }

  return { created };
}

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getDay();
}

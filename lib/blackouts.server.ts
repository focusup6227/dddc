import { createClient } from "@/lib/supabase/server";
import type { Blackout, ServiceKind } from "@/lib/supabase/types";
import { addDays } from "@/lib/format";

export async function getBlackoutsInRange(
  from: string,
  to: string,
): Promise<Blackout[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blackouts")
    .select("*")
    .lte("start_date", to)
    .gte("end_date", from)
    .order("start_date");
  return (data ?? []) as Blackout[];
}

/**
 * Set of YYYY-MM-DD dates blacked out for the given service kind, within
 * [from, to] inclusive.
 */
export async function getBlackoutDates(
  from: string,
  to: string,
  kind: ServiceKind,
): Promise<Set<string>> {
  const rows = await getBlackoutsInRange(from, to);
  const filtered = rows.filter((b) =>
    kind === "daycare" ? b.blocks_daycare : b.blocks_boarding,
  );
  return expandBlackoutDates(filtered, from, to);
}

export function expandBlackoutDates(
  blackouts: Blackout[],
  from: string,
  to: string,
): Set<string> {
  const out = new Set<string>();
  for (const b of blackouts) {
    let cur = b.start_date > from ? b.start_date : from;
    const end = b.end_date < to ? b.end_date : to;
    while (cur <= end) {
      out.add(cur);
      cur = addDays(cur, 1);
    }
  }
  return out;
}

export function indexBlackoutsByDate(
  blackouts: Blackout[],
  from: string,
  to: string,
): Map<string, Blackout[]> {
  const byDate = new Map<string, Blackout[]>();
  for (const b of blackouts) {
    let cur = b.start_date > from ? b.start_date : from;
    const end = b.end_date < to ? b.end_date : to;
    while (cur <= end) {
      const arr = byDate.get(cur) ?? [];
      arr.push(b);
      byDate.set(cur, arr);
      cur = addDays(cur, 1);
    }
  }
  return byDate;
}

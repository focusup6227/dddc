import { createClient } from "@/lib/supabase/server";
import type { Event } from "@/lib/supabase/types";

/**
 * Events that intersect [from, to] inclusive (YYYY-MM-DD strings).
 * An event with [start, end] overlaps the window iff start <= to AND end >= from.
 */
export async function getEventsInRange(from: string, to: string): Promise<Event[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*")
    .lte("start_date", to)
    .gte("end_date", from)
    .order("start_date");
  return (data ?? []) as Event[];
}

/**
 * Map ISO date -> list of events covering that date.
 * Only includes dates within [from, to].
 */
export function indexEventsByDate(
  events: Event[],
  from: string,
  to: string,
): Map<string, Event[]> {
  const byDate = new Map<string, Event[]>();
  for (const ev of events) {
    const start = ev.start_date > from ? ev.start_date : from;
    const end = ev.end_date < to ? ev.end_date : to;
    let cur = start;
    while (cur <= end) {
      const arr = byDate.get(cur) ?? [];
      arr.push(ev);
      byDate.set(cur, arr);
      cur = nextDay(cur);
    }
  }
  return byDate;
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, (d ?? 1) + 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

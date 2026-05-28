// Pickup/drop-off window for daycare and boarding. Bookings outside this
// range are rejected by the server actions and the time pickers in the UI.
export const EARLIEST_TIME = "06:00";
export const LATEST_TIME = "18:00";

export const DEFAULT_DROP_OFF_TIME = "08:00";
export const DEFAULT_PICKUP_TIME = "17:00";

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(t: string): boolean {
  return HHMM_RE.test(t);
}

export function isTimeInWindow(t: string): boolean {
  if (!isValidTime(t)) return false;
  return t >= EARLIEST_TIME && t <= LATEST_TIME;
}

// Postgres TIME columns come back as "HH:MM:SS". Normalize to "HH:MM" for
// display + comparison.
export function normalizeTime(t: string): string {
  return t.slice(0, 5);
}

export function formatTime(t: string | null): string {
  if (!t) return "";
  const [hStr, m] = normalizeTime(t).split(":");
  const h = Number(hStr);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

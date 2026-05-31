/**
 * The calendar days a booking occupies, clamped to [rangeStart, rangeEnd] (inclusive).
 * Daycare occupies only its service_date. Boarding occupies every day from drop-off
 * through its departure (service_end_date) day inclusive, matching the in-house window
 * used on the staff Today page. Returns dates in ascending order.
 */
export function bookingDatesInRange(
  booking: {
    service_kind: string;
    service_date: string;
    service_end_date: string;
  },
  rangeStart: string,
  rangeEnd: string,
): string[] {
  const lastDay =
    booking.service_kind === "boarding"
      ? booking.service_end_date
      : booking.service_date;
  // ISO dates (YYYY-MM-DD) compare correctly as strings.
  const start =
    booking.service_date < rangeStart ? rangeStart : booking.service_date;
  const end = lastDay > rangeEnd ? rangeEnd : lastDay;
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    days.push(d);
  }
  return days;
}

export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateShort(iso: string): string {
  // service_date columns are YYYY-MM-DD; avoid TZ drift by parsing as local.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(isoOrDate: string | Date, days: number): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : new Date(isoOrDate);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

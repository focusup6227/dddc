// Time-aware greeting for dashboards. Always uses the daycare's local
// timezone so a server in another region still says "Good morning" at 9am
// local for the user.
export function getGreeting(date: Date = new Date()): string {
  const tz = process.env.DAYCARE_TIMEZONE ?? "America/Chicago";
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }).format(date),
  );
  if (Number.isNaN(hour)) return "Hello";
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

export function firstName(fullName: string | null | undefined): string {
  if (!fullName) return "";
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  return first;
}

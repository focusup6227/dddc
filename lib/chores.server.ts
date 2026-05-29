import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Booking, Chore, Dog } from "@/lib/supabase/types";

// Generate any missing auto chores for `date`. Idempotent — relies on the
// (due_date, auto_key, dog_id) partial unique index, with onConflict to no-op.
export async function ensureAutoChoresForDate(date: string): Promise<void> {
  const supabase = await createClient();

  // Dogs in attendance on `date`: any non-canceled booking covering it.
  // service_end_date is exclusive (boarding checkout date / daycare = next day).
  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("*")
    .lte("service_date", date)
    .gt("service_end_date", date)
    .not("status", "in", "(canceled,no_show)");
  const bookings = (bookingsData ?? []) as Booking[];

  const dogIds = Array.from(new Set(bookings.map((b) => b.dog_id)));
  const dogsRes = dogIds.length
    ? await supabase.from("dogs").select("id, name").in("id", dogIds)
    : { data: [] };
  const dogs = (dogsRes.data ?? []) as Pick<Dog, "id" | "name">[];
  const dogName = new Map(dogs.map((d) => [d.id, d.name]));

  // --- Walks (AM + PM + evening per checked-in dog) -------------------------
  const walkRows = dogs.flatMap((d) => [
    {
      kind: "walk" as const,
      title: `Morning walk — ${d.name}`,
      due_date: date,
      dog_id: d.id,
      auto_key: "walk_am",
    },
    {
      kind: "walk" as const,
      title: `Afternoon walk — ${d.name}`,
      due_date: date,
      dog_id: d.id,
      auto_key: "walk_pm",
    },
    {
      kind: "walk" as const,
      title: `Evening walk — ${d.name}`,
      due_date: date,
      dog_id: d.id,
      auto_key: "walk_eve",
    },
  ]);

  // --- Backyard sanitize: weekly, Mondays only ------------------------------
  const sanitizeRows: Array<{
    kind: "sanitize";
    title: string;
    due_date: string;
    dog_id: string | null;
    booking_id: string | null;
    auto_key: string;
  }> = [];
  if (isMonday(date)) {
    sanitizeRows.push({
      kind: "sanitize",
      title: "Sanitize backyard (weekly)",
      due_date: date,
      dog_id: null,
      booking_id: null,
      auto_key: "sanitize_backyard",
    });
  }

  // --- Kennel sanitize: after every overnight boarding stay that ends today.
  // service_end_date is the checkout date; the dog vacated the kennel today.
  const { data: endedToday } = await supabase
    .from("bookings")
    .select("id, dog_id")
    .eq("service_end_date", date)
    .eq("service_kind", "boarding")
    .not("status", "in", "(canceled,no_show)");
  for (const b of (endedToday ?? []) as Pick<Booking, "id" | "dog_id">[]) {
    const name = dogName.get(b.dog_id) ?? "boarder";
    sanitizeRows.push({
      kind: "sanitize",
      title: `Sanitize kennel — ${name}`,
      due_date: date,
      dog_id: b.dog_id,
      booking_id: b.id,
      auto_key: `sanitize_kennel:${b.id}`,
    });
  }

  // --- Manual recurring templates → instance for today ----------------------
  const { data: templates } = await supabase
    .from("chores")
    .select("*")
    .neq("recurrence", "none");
  const templateRows: Array<{
    kind: "manual";
    title: string;
    description: string | null;
    due_date: string;
    dog_id: string | null;
    auto_key: string;
    parent_chore_id: string;
  }> = [];
  for (const t of (templates ?? []) as Chore[]) {
    if (t.recurrence === "weekly" && t.weekday !== weekdayOf(date)) continue;
    templateRows.push({
      kind: "manual",
      title: t.title,
      description: t.description,
      due_date: date,
      dog_id: t.dog_id,
      auto_key: `template:${t.id}`,
      parent_chore_id: t.id,
    });
  }

  const candidates = [...walkRows, ...sanitizeRows, ...templateRows];
  if (candidates.length === 0) return;

  // Pre-filter against existing auto-rows for this date. The unique index is
  // partial + uses coalesce(dog_id::text,''), which can't be addressed by
  // Postgres ON CONFLICT, so we filter in app code. The DB constraint is
  // still the source of truth — it'll reject any race that slips through.
  const { data: existing } = await supabase
    .from("chores")
    .select("auto_key, dog_id")
    .eq("due_date", date)
    .not("auto_key", "is", null);
  const taken = new Set(
    (existing ?? []).map((r) => `${r.auto_key}|${r.dog_id ?? ""}`),
  );
  const newRows = candidates.filter(
    (r) => !taken.has(`${r.auto_key}|${r.dog_id ?? ""}`),
  );
  if (newRows.length === 0) return;
  const { error } = await supabase.from("chores").insert(newRows);
  if (error) {
    // Don't fail silently — a constraint violation on one row aborts the whole
    // batch and would otherwise drop auto-generated walks without a trace.
    throw new Error(`Failed to materialize auto chores for ${date}: ${error.message}`);
  }
}

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getDay();
}

function isMonday(iso: string): boolean {
  return weekdayOf(iso) === 1;
}

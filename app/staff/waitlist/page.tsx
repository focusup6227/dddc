import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Dog,
  Profile,
  WaitlistEntry,
} from "@/lib/supabase/types";
import { formatDateShort, todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function StaffWaitlistPage() {
  await requireStaff();
  const supabase = await createClient();
  const today = todayISO();

  const { data: entriesData } = await supabase
    .from("waitlist_entries")
    .select("*")
    .in("status", ["pending", "notified"])
    .gte("service_date", today)
    .order("service_date")
    .order("created_at");
  const entries = (entriesData ?? []) as WaitlistEntry[];

  const dogIds = Array.from(new Set(entries.map((e) => e.dog_id)));
  const custIds = Array.from(new Set(entries.map((e) => e.customer_id)));

  const [{ data: dogRows }, { data: custRows }] = await Promise.all([
    dogIds.length
      ? supabase.from("dogs").select("*").in("id", dogIds)
      : Promise.resolve({ data: [] as Dog[] }),
    custIds.length
      ? supabase.from("profiles").select("*").in("id", custIds)
      : Promise.resolve({ data: [] as Profile[] }),
  ]);
  const dogs = (dogRows ?? []) as Dog[];
  const custs = (custRows ?? []) as Profile[];
  const dogById = new Map(dogs.map((d) => [d.id, d]));
  const custById = new Map(custs.map((c) => [c.id, c]));

  // Group by date for a tidy roster.
  type Group = { date: string; kind: "daycare" | "boarding"; entries: WaitlistEntry[] };
  const groups = new Map<string, Group>();
  for (const e of entries) {
    const key = `${e.service_date}:${e.service_kind}`;
    const g = groups.get(key) ?? { date: e.service_date, kind: e.service_kind, entries: [] };
    g.entries.push(e);
    groups.set(key, g);
  }
  const ordered = Array.from(groups.values()).sort(
    (a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind),
  );

  return (
    <div className="space-y-6 animate-fade-up">
      <header>
        <h1 className="font-display text-3xl font-bold text-ink-900">Waitlist</h1>
        <p className="text-sm text-ink-500">
          Customers waiting for a spot. Canceling a booking auto-notifies the
          oldest entry.
        </p>
      </header>

      {ordered.length === 0 ? (
        <div className="card text-sm text-ink-500">No one is on the list.</div>
      ) : (
        <ul className="space-y-4">
          {ordered.map((g) => (
            <li key={`${g.date}:${g.kind}`} className="card">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-lg font-semibold text-ink-900">
                  {formatDateShort(g.date)}{" "}
                  <span className="text-sm font-normal text-ink-500">
                    · {g.kind === "boarding" ? "Boarding" : "Day care"} ·{" "}
                    {g.entries.length} waiting
                  </span>
                </h2>
              </div>
              <ul className="divide-y divide-stone-200/80">
                {g.entries.map((e) => {
                  const dog = dogById.get(e.dog_id);
                  const cust = custById.get(e.customer_id);
                  return (
                    <li
                      key={e.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-ink-900">
                          {dog?.name ?? "Dog"}{" "}
                          <span className="font-normal text-ink-500">
                            · {cust?.full_name || cust?.email}
                          </span>
                        </p>
                        {cust?.phone && (
                          <p className="text-xs text-ink-500">{cust.phone}</p>
                        )}
                      </div>
                      <span
                        className={
                          e.status === "notified" ? "pill-success" : "pill-neutral"
                        }
                      >
                        {e.status}
                      </span>
                      {cust && (
                        <Link
                          href={`/staff/customers/${cust.id}`}
                          className="text-xs font-semibold text-brand-700 hover:underline"
                        >
                          Open customer →
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

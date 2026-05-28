import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Dog, Profile } from "@/lib/supabase/types";
import { todayISO } from "@/lib/format";
import { INCIDENT_KINDS, INCIDENT_SEVERITIES } from "@/lib/incidents";
import { createIncident } from "../actions";

export default async function NewIncidentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; dog?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: dogRows } = await supabase
    .from("dogs")
    .select("id, name, owner_id")
    .eq("active", true)
    .order("name");
  const dogs = (dogRows ?? []) as Pick<Dog, "id" | "name" | "owner_id">[];

  const ownerIds = Array.from(new Set(dogs.map((d) => d.owner_id)));
  const { data: ownerRows } = ownerIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ownerIds)
    : { data: [] as Pick<Profile, "id" | "full_name" | "email">[] };
  const ownerById = new Map(
    (ownerRows ?? []).map((p) => [
      p.id,
      p as Pick<Profile, "id" | "full_name" | "email">,
    ]),
  );

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">
            Log an incident
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Customers can&apos;t see this — it&apos;s for your records.
          </p>
        </div>
        <Link
          href="/staff/incidents"
          className="text-sm font-medium text-ink-700 hover:text-ink-900 hover:underline"
        >
          ← Back to incidents
        </Link>
      </header>

      {params.error && (
        <div className="rounded-2xl border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-800 shadow-soft">
          {params.error}
        </div>
      )}

      <form action={createIncident} className="card space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="dog_id" className="label">Dog</label>
            <select
              id="dog_id"
              name="dog_id"
              required
              defaultValue={params.dog ?? ""}
              className="input"
            >
              <option value="">Pick a dog…</option>
              {dogs.map((d) => {
                const owner = ownerById.get(d.owner_id);
                const label = owner
                  ? `${d.name} (${owner.full_name || owner.email})`
                  : d.name;
                return (
                  <option key={d.id} value={d.id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label htmlFor="occurred_on" className="label">Date</label>
            <input
              id="occurred_on"
              name="occurred_on"
              type="date"
              required
              defaultValue={todayISO()}
              className="input"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="kind" className="label">Type</label>
            <select id="kind" name="kind" required defaultValue="injury" className="input">
              {INCIDENT_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="severity" className="label">Severity</label>
            <select id="severity" name="severity" required defaultValue="low" className="input">
              {INCIDENT_SEVERITIES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="description" className="label">What happened?</label>
          <textarea
            id="description"
            name="description"
            rows={5}
            required
            className="input"
            placeholder="Who, what, when, where. Include any actions taken (vet called, owner contacted, etc.)."
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            name="customer_notified"
            value="yes"
            className="h-4 w-4 rounded border-stone-300"
          />
          I&apos;ve already notified the owner
        </label>

        <div className="flex justify-end gap-3">
          <Link href="/staff/incidents" className="btn-ghost">Cancel</Link>
          <button type="submit" className="btn-primary">Save</button>
        </div>
        <p className="text-xs text-ink-500">
          You&apos;ll be able to attach photos on the next screen.
        </p>
      </form>
    </div>
  );
}

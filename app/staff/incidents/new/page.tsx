import Link from "next/link";
import { requireFullStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Dog, Profile } from "@/lib/supabase/types";
import { todayISO } from "@/lib/format";
import { INCIDENT_KINDS, INCIDENT_SEVERITIES } from "@/lib/incidents";
import { ToastNotifier } from "@/components/ToastNotifier";
import { createIncident } from "../actions";

const TOASTS = [{ param: "error", tone: "error" as const }];

export default async function NewIncidentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; dog?: string }>;
}) {
  await requireFullStaff();
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

      <ToastNotifier toasts={TOASTS} />

      <form action={createIncident} className="card space-y-4">
        <div>
          <label className="label">Dogs involved</label>
          <p className="-mt-1 mb-2 text-xs text-ink-500">
            Pick everyone involved — each dog&apos;s owner can be notified.
          </p>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-stone-200 bg-white">
            {dogs.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-500">No active dogs.</p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {dogs.map((d) => {
                  const owner = ownerById.get(d.owner_id);
                  return (
                    <li key={d.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-cream-50">
                        <input
                          type="checkbox"
                          name="dog_id"
                          value={d.id}
                          defaultChecked={params.dog === d.id}
                          className="h-4 w-4 rounded border-stone-300"
                        />
                        <span className="text-ink-900">{d.name}</span>
                        {owner && (
                          <span className="text-xs text-ink-500">
                            {owner.full_name || owner.email}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
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

        <label className="flex items-start gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            name="customer_notified"
            value="yes"
            defaultChecked
            className="mt-0.5 h-4 w-4 rounded border-stone-300"
          />
          <span>
            Email the owner about this incident
            <span className="block text-xs text-ink-500">
              On by default. Uncheck for minor things you&apos;ll mention at pickup.
            </span>
          </span>
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

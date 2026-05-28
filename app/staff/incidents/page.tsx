import Link from "next/link";
import { Plus } from "lucide-react";
import { requireFullStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Dog, Incident, Profile } from "@/lib/supabase/types";
import { formatDateShort } from "@/lib/format";
import { INCIDENT_KIND_LABEL, INCIDENT_SEVERITY_LABEL } from "@/lib/incidents";
import { StaffSubNav } from "@/components/StaffSubNav";
import { EmptyState } from "@/components/EmptyState";
import { ShieldPaw } from "@/components/illustrations";
import { getPendingVaccineCount } from "@/lib/vaccines.server";

export const dynamic = "force-dynamic";

export default async function StaffIncidentsPage() {
  await requireFullStaff();
  const supabase = await createClient();

  const { data: incidentRows } = await supabase
    .from("incidents")
    .select("*")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  const incidents = (incidentRows ?? []) as Incident[];

  const dogIds = Array.from(new Set(incidents.map((i) => i.dog_id)));
  const { data: dogRows } = dogIds.length
    ? await supabase
        .from("dogs")
        .select("id, name, owner_id")
        .in("id", dogIds)
    : { data: [] as Pick<Dog, "id" | "name" | "owner_id">[] };
  const dogsById = new Map(
    (dogRows ?? []).map((d) => [
      d.id,
      d as Pick<Dog, "id" | "name" | "owner_id">,
    ]),
  );

  const ownerIds = Array.from(
    new Set((dogRows ?? []).map((d) => d.owner_id).filter(Boolean) as string[]),
  );
  const { data: ownerRows } = ownerIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ownerIds)
    : { data: [] as Pick<Profile, "id" | "full_name" | "email">[] };
  const ownersById = new Map(
    (ownerRows ?? []).map((p) => [
      p.id,
      p as Pick<Profile, "id" | "full_name" | "email">,
    ]),
  );

  const pendingVax = await getPendingVaccineCount();
  const subnav = [
    { href: "/staff/dogs", label: "All dogs" },
    { href: "/staff/vaccines", label: "Vaccines", badge: pendingVax },
    { href: "/staff/incidents", label: "Incidents", active: true },
  ];

  return (
    <div className="space-y-6 animate-fade-up">
      <StaffSubNav items={subnav} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">
            Incidents
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Staff-only log of bites, injuries, escapes, and anything else worth
            documenting.
          </p>
        </div>
        <Link href="/staff/incidents/new" className="btn-primary">
          <Plus size={16} /> Log incident
        </Link>
      </header>

      {incidents.length === 0 ? (
        <EmptyState
          illustration={<ShieldPaw className="h-full w-auto" />}
          title="No incidents logged"
          description="A quiet record is a good record. New entries will appear here."
          action={
            <Link href="/staff/incidents/new" className="btn-secondary">
              <Plus size={16} /> Log incident
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-stone-200/80 rounded-2xl border border-stone-200/80 bg-white shadow-soft">
          {incidents.map((i) => {
            const dog = dogsById.get(i.dog_id);
            const owner = dog ? ownersById.get(dog.owner_id) : null;
            return (
              <li key={i.id}>
                <Link
                  href={`/staff/incidents/${i.id}`}
                  className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 transition-colors hover:bg-cream-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-semibold text-ink-900">
                      {INCIDENT_KIND_LABEL[i.kind]} ·{" "}
                      <span className="text-brand-700">
                        {dog?.name ?? "Unknown dog"}
                      </span>
                    </p>
                    <p className="text-sm text-ink-500">
                      {formatDateShort(i.occurred_on)}
                      {owner ? ` · ${owner.full_name || owner.email}` : ""}
                    </p>
                    <p className="mt-1 line-clamp-1 text-sm text-ink-700">
                      {i.description}
                    </p>
                  </div>
                  <SeverityPill severity={i.severity} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SeverityPill({ severity }: { severity: Incident["severity"] }) {
  const cls =
    severity === "high"
      ? "pill-danger"
      : severity === "medium"
        ? "pill-warn"
        : "pill-neutral";
  return <span className={cls}>{INCIDENT_SEVERITY_LABEL[severity]}</span>;
}

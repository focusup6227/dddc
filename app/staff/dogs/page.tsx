import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Dog, Profile } from "@/lib/supabase/types";
import { DogAvatar } from "@/components/DogAvatar";
import { StaffSubNav } from "@/components/StaffSubNav";
import { EmptyState } from "@/components/EmptyState";
import { DogHouse } from "@/components/illustrations";
import { getPendingVaccineCount } from "@/lib/vaccines.server";

export default async function StaffDogsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireStaff();
  const supabase = await createClient();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";

  let dogQuery = supabase
    .from("dogs")
    .select("*")
    .eq("active", true)
    .order("name");
  if (q) dogQuery = dogQuery.or(`name.ilike.%${q}%,breed.ilike.%${q}%`);
  const { data } = await dogQuery.limit(200);
  const dogs = (data ?? []) as Dog[];

  const ownerIds = Array.from(new Set(dogs.map((d) => d.owner_id)));
  const { data: ownersData } = ownerIds.length
    ? await supabase.from("profiles").select("*").in("id", ownerIds)
    : { data: [] as Profile[] };
  const owners = (ownersData ?? []) as Profile[];

  const pendingVax = await getPendingVaccineCount();
  const subnav = [
    { href: "/staff/dogs", label: "All dogs", active: true },
    { href: "/staff/vaccines", label: "Vaccines", badge: pendingVax },
    { href: "/staff/incidents", label: "Incidents" },
  ];

  return (
    <div className="space-y-6 animate-fade-up">
      <StaffSubNav items={subnav} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">Dogs</h1>
          <p className="mt-1 text-sm text-ink-500">
            {dogs.length} {dogs.length === 1 ? "dog" : "dogs"} on file.
          </p>
        </div>
        <form className="flex w-full items-end gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-400">
              <Search size={16} />
            </span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search by name or breed"
              className="input pl-9"
            />
          </div>
          <button type="submit" className="btn-secondary shrink-0">
            Search
          </button>
        </form>
      </header>

      {dogs.length === 0 ? (
        <EmptyState
          illustration={<DogHouse className="h-full w-auto" />}
          title={q ? "No matches" : "No dogs yet"}
          description={
            q
              ? "Try a different search."
              : "Once customers add their pups, you'll see them here."
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dogs.map((d) => {
            const owner = owners.find((o) => o.id === d.owner_id);
            return (
              <li key={d.id}>
                <Link
                  href={`/staff/dogs/${d.id}`}
                  className="card-lift group flex items-center gap-4"
                >
                  <DogAvatar photoPath={d.photo_path} name={d.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg font-semibold text-ink-900">
                      {d.name}
                    </p>
                    <p className="truncate text-sm text-ink-500">
                      {d.breed ?? "Mixed"} ·{" "}
                      {owner?.full_name ?? owner?.email ?? "—"}
                    </p>
                  </div>
                  <ChevronRight
                    size={18}
                    className="text-ink-400 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

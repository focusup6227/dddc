import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Dog, Profile } from "@/lib/supabase/types";
import { DogAvatar } from "@/components/DogAvatar";

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

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold text-stone-900">Dogs</h1>
        <form className="flex items-end gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by name or breed"
            className="input w-64"
          />
          <button type="submit" className="btn-secondary">Search</button>
        </form>
      </header>

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {dogs.map((d) => {
          const owner = owners.find((o) => o.id === d.owner_id);
          return (
            <li key={d.id}>
              <Link
                href={`/staff/dogs/${d.id}`}
                className="card flex items-center gap-4 hover:shadow-md transition-shadow"
              >
                <DogAvatar photoPath={d.photo_path} name={d.name} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-stone-900">{d.name}</p>
                  <p className="truncate text-sm text-stone-500">
                    {d.breed ?? "Mixed"} · {owner?.full_name ?? owner?.email ?? "—"}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

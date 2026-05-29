import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Dog } from "@/lib/supabase/types";
import { DogAvatar } from "@/components/DogAvatar";
import { EmptyState } from "@/components/EmptyState";
import { DogHouse } from "@/components/illustrations";

export default async function DogsPage() {
  const { userId } = await requireCustomer();
  const supabase = await createClient();

  const { data } = await supabase
    .from("dogs")
    .select("*")
    .eq("owner_id", userId)
    .order("name");
  const dogs = (data ?? []) as Dog[];

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">
            My Dogs
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Profiles, vaccines, and care notes for your pups.
          </p>
        </div>
        <Link href="/dogs/new" className="btn-primary">
          <Plus size={16} /> Add a dog
        </Link>
      </div>

      {dogs.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            illustration={<DogHouse className="h-full w-auto" />}
            title="No dogs yet"
            description="Add your first pup to start booking daycare or boarding."
            action={
              <Link href="/dogs/new" className="btn-primary">
                <Plus size={16} /> Add your first dog
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dogs.map((d) => (
            <li key={d.id}>
              <Link
                href={`/dogs/${d.id}`}
                className="card-lift group flex items-center gap-4"
              >
                <DogAvatar photoPath={d.photo_path} name={d.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg font-semibold text-ink-900">
                    {d.name}
                  </p>
                  <p className="truncate text-sm text-ink-500">
                    {d.breed ?? "Mixed breed"}
                    {d.weight_lbs ? ` · ${d.weight_lbs} lbs` : ""}
                  </p>
                </div>
                <ChevronRight
                  size={18}
                  className="text-ink-400 transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

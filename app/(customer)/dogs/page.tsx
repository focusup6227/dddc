import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Dog } from "@/lib/supabase/types";
import { DogAvatar } from "@/components/DogAvatar";

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
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900">My Dogs</h1>
        <Link href="/dogs/new" className="btn-primary">Add a dog</Link>
      </div>

      {dogs.length === 0 ? (
        <p className="mt-6 text-stone-600">You haven&apos;t added any dogs yet.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dogs.map((d) => (
            <li key={d.id}>
              <Link
                href={`/dogs/${d.id}`}
                className="card flex items-center gap-4 hover:shadow-md transition-shadow"
              >
                <DogAvatar photoPath={d.photo_path} name={d.name} />
                <div>
                  <p className="font-semibold text-stone-900">{d.name}</p>
                  <p className="text-sm text-stone-500">
                    {d.breed ?? "Mixed breed"}
                    {d.weight_lbs ? ` · ${d.weight_lbs} lbs` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

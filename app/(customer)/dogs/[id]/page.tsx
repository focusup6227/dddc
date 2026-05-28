import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Dog, DogNote } from "@/lib/supabase/types";
import { DogAvatar } from "@/components/DogAvatar";
import { formatDate } from "@/lib/format";
import { DogForm } from "../DogForm";
import { saveDog } from "../actions";

export default async function DogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await requireCustomer();
  const supabase = await createClient();

  const { data: dog } = await supabase
    .from("dogs")
    .select("*")
    .eq("id", id)
    .eq("owner_id", userId)
    .maybeSingle<Dog>();
  if (!dog) notFound();

  const { data: notesData } = await supabase
    .from("dog_notes")
    .select("*")
    .eq("dog_id", id)
    .order("created_at", { ascending: false })
    .limit(20);
  const notes = (notesData ?? []) as DogNote[];

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4">
        <DogAvatar photoPath={dog.photo_path} name={dog.name} size={80} />
        <div>
          <h1 className="text-2xl font-bold text-stone-900">{dog.name}</h1>
          <p className="text-stone-500">{dog.breed ?? "Mixed breed"}</p>
        </div>
      </div>

      {notes.length > 0 && (
        <section className="card mt-6">
          <h2 className="text-lg font-semibold text-stone-900">Day care notes</h2>
          <ul className="mt-3 divide-y divide-stone-200">
            {notes.map((n) => (
              <li key={n.id} className="py-3">
                <p className="text-xs text-stone-500">{formatDate(n.created_at)}</p>
                <p className="mt-1 text-stone-800">{n.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mt-8 text-lg font-semibold text-stone-900">Profile</h2>
      <DogForm action={saveDog} dog={dog} />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Booking, Dog, DogNote, Profile } from "@/lib/supabase/types";
import { DogAvatar } from "@/components/DogAvatar";
import { formatDate, formatDateShort } from "@/lib/format";
import { addDogNote, updateStaffNotes } from "../../actions";

export default async function StaffDogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const supabase = await createClient();

  const { data: dog } = await supabase
    .from("dogs")
    .select("*")
    .eq("id", id)
    .maybeSingle<Dog>();
  if (!dog) notFound();

  const [ownerRes, notesRes, bookingsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", dog.owner_id).maybeSingle<Profile>(),
    supabase
      .from("dog_notes")
      .select("*")
      .eq("dog_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("bookings")
      .select("*")
      .eq("dog_id", id)
      .order("service_date", { ascending: false })
      .limit(20),
  ]);
  const owner = ownerRes.data ?? null;
  const notes = (notesRes.data ?? []) as DogNote[];
  const bookings = (bookingsRes.data ?? []) as Booking[];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center gap-4">
        <DogAvatar photoPath={dog.photo_path} name={dog.name} size={96} />
        <div>
          <h1 className="text-2xl font-bold text-stone-900">{dog.name}</h1>
          <p className="text-stone-600">
            {dog.breed ?? "Mixed breed"}
            {dog.weight_lbs ? ` · ${dog.weight_lbs} lbs` : ""}
            {dog.sex ? ` · ${dog.sex}` : ""}
          </p>
          {owner && (
            <p className="text-sm text-stone-500">
              Owner:{" "}
              <Link
                href={`/staff/customers/${owner.id}`}
                className="text-brand-700 hover:underline"
              >
                {owner.full_name || owner.email}
              </Link>
              {owner.phone ? ` · ${owner.phone}` : ""}
            </p>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="font-semibold text-stone-900">Health</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Vaccinations" value={dog.vaccinations_current ? "Current ✓" : "Not confirmed"} />
            <Row label="Vaccine notes" value={dog.vaccination_notes} />
            <Row label="Allergies" value={dog.allergies} />
            <Row label="Medications" value={dog.medications} />
            <Row label="Vet" value={dog.vet_name} />
            <Row label="Vet phone" value={dog.vet_phone} />
          </dl>
        </section>

        <section className="card">
          <h2 className="font-semibold text-stone-900">Care</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Feeding" value={dog.feeding_notes} />
            <Row label="Behavior" value={dog.behavior_notes} />
          </dl>
        </section>
      </div>

      <section className="card">
        <h2 className="font-semibold text-stone-900">Staff-only notes</h2>
        <p className="mt-1 text-xs text-stone-500">Customers can&apos;t see these.</p>
        <form action={updateStaffNotes} className="mt-3">
          <input type="hidden" name="dog_id" value={dog.id} />
          <textarea
            name="staff_notes"
            rows={4}
            defaultValue={dog.staff_notes ?? ""}
            className="input"
            placeholder="e.g. 'reactive on leash, separate during pickup time'"
          />
          <div className="mt-2 flex justify-end">
            <button type="submit" className="btn-primary">Save</button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-stone-900">Daily journal</h2>
        <form action={addDogNote} className="card mt-3">
          <input type="hidden" name="dog_id" value={dog.id} />
          <textarea
            name="note"
            rows={3}
            required
            className="input"
            placeholder="What happened today? (visible to the owner)"
          />
          <div className="mt-2 flex justify-end">
            <button type="submit" className="btn-primary">Add note</button>
          </div>
        </form>

        {notes.length === 0 ? (
          <p className="mt-4 text-stone-600">No notes yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
            {notes.map((n) => (
              <li key={n.id} className="px-4 py-3">
                <p className="text-xs text-stone-500">{formatDate(n.created_at)}</p>
                <p className="mt-1 whitespace-pre-wrap text-stone-800">{n.note}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-stone-900">Recent bookings</h2>
        {bookings.length === 0 ? (
          <p className="mt-2 text-stone-600">None.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{formatDateShort(b.service_date)}</span>
                <span className="text-stone-500">
                  {b.payment_kind} · {b.status} · {b.payment_status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-stone-500">{label}</dt>
      <dd className="col-span-2 text-stone-900">
        {value === null || value === "" ? <span className="text-stone-400">—</span> : String(value)}
      </dd>
    </div>
  );
}

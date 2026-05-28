import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Dog,
  DogLogEntry,
  DogNote,
  DogVaccination,
} from "@/lib/supabase/types";
import { DogAvatar } from "@/components/DogAvatar";
import { formatDate } from "@/lib/format";
import { summarizeCoverage } from "@/lib/vaccines";
import { DOG_LOG_EMOJI, DOG_LOG_LABEL } from "@/lib/dogLog";
import { DogForm } from "../DogForm";
import { saveDog } from "../actions";
import { VaccinesPanel } from "../VaccinesPanel";

export default async function DogDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const { userId } = await requireCustomer();
  const supabase = await createClient();

  const { data: dog } = await supabase
    .from("dogs")
    .select("*")
    .eq("id", id)
    .eq("owner_id", userId)
    .maybeSingle<Dog>();
  if (!dog) notFound();

  const [notesRes, vaxRes, logRes] = await Promise.all([
    supabase
      .from("dog_notes")
      .select("*")
      .eq("dog_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("dog_vaccinations").select("*").eq("dog_id", id),
    supabase
      .from("dog_log_entries")
      .select("*")
      .eq("dog_id", id)
      .order("given_at", { ascending: false })
      .limit(20),
  ]);
  const notes = (notesRes.data ?? []) as DogNote[];
  const coverage = summarizeCoverage((vaxRes.data ?? []) as DogVaccination[]);
  const logEntries = (logRes.data ?? []) as DogLogEntry[];

  return (
    <div className="max-w-2xl space-y-6 animate-fade-up">
      <div className="flex items-center gap-4">
        <DogAvatar photoPath={dog.photo_path} name={dog.name} size={80} />
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">
            {dog.name}
          </h1>
          <p className="text-ink-500">{dog.breed ?? "Mixed breed"}</p>
        </div>
      </div>

      {isNew && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900 shadow-soft">
          Profile saved. Upload your dog&apos;s vaccine records below to unlock
          booking.
        </div>
      )}

      <VaccinesPanel dogId={dog.id} ownerId={userId} coverage={coverage} />

      {logEntries.length > 0 && (
        <section className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">
            Care log
          </h2>
          <p className="text-sm text-ink-500">
            Meals, meds, and potty breaks our team logged while {dog.name} was with us.
          </p>
          <ul className="mt-3 divide-y divide-stone-200/80">
            {logEntries.map((e) => (
              <li key={e.id} className="py-2 text-sm">
                <p className="text-ink-900">
                  {DOG_LOG_EMOJI[e.kind]} {DOG_LOG_LABEL[e.kind]}
                  {e.detail && <span className="text-ink-700"> — {e.detail}</span>}
                </p>
                <p className="text-xs text-ink-500">{formatDate(e.given_at)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {notes.length > 0 && (
        <section className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">
            Day care notes
          </h2>
          <ul className="mt-3 divide-y divide-stone-200/80">
            {notes.map((n) => (
              <li key={n.id} className="py-3">
                <p className="text-xs text-ink-500">
                  {formatDate(n.created_at)}
                </p>
                <p className="mt-1 text-ink-900">{n.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div>
        <h2 className="font-display text-xl font-semibold text-ink-900">
          Profile
        </h2>
        <DogForm action={saveDog} dog={dog} />
      </div>
    </div>
  );
}

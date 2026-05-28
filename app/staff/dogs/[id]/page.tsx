import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Booking,
  Dog,
  DogLogEntry,
  DogNote,
  DogVaccination,
  Incident,
  Profile,
} from "@/lib/supabase/types";
import { DogAvatar } from "@/components/DogAvatar";
import { formatDate, formatDateShort } from "@/lib/format";
import {
  REQUIRED_VACCINES,
  summarizeCoverage,
  type VaccineCoverage,
} from "@/lib/vaccines";
import {
  INCIDENT_KIND_LABEL,
  INCIDENT_SEVERITY_LABEL,
} from "@/lib/incidents";
import { DOG_LOG_EMOJI, DOG_LOG_KINDS, DOG_LOG_LABEL } from "@/lib/dogLog";
import {
  addDogLogEntry,
  addDogNote,
  deleteDogLogEntry,
  updateStaffNotes,
} from "../../actions";

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

  const [ownerRes, notesRes, bookingsRes, vaxRes, incidentRes, logRes] =
    await Promise.all([
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
      supabase.from("dog_vaccinations").select("*").eq("dog_id", id),
      supabase
        .from("incidents")
        .select("*")
        .eq("dog_id", id)
        .order("occurred_on", { ascending: false })
        .limit(10),
      supabase
        .from("dog_log_entries")
        .select("*")
        .eq("dog_id", id)
        .order("given_at", { ascending: false })
        .limit(30),
    ]);
  const owner = ownerRes.data ?? null;
  const notes = (notesRes.data ?? []) as DogNote[];
  const bookings = (bookingsRes.data ?? []) as Booking[];
  const coverage = summarizeCoverage((vaxRes.data ?? []) as DogVaccination[]);
  const incidents = (incidentRes.data ?? []) as Incident[];
  const logEntries = (logRes.data ?? []) as DogLogEntry[];

  return (
    <div className="space-y-8 animate-fade-up">
      <header className="flex flex-wrap items-center gap-5">
        <DogAvatar photoPath={dog.photo_path} name={dog.name} size={96} />
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">
            {dog.name}
          </h1>
          <p className="text-ink-700">
            {dog.breed ?? "Mixed breed"}
            {dog.weight_lbs ? ` · ${dog.weight_lbs} lbs` : ""}
            {dog.sex ? ` · ${dog.sex}` : ""}
          </p>
          {owner && (
            <p className="text-sm text-ink-500">
              Owner:{" "}
              <Link
                href={`/staff/customers/${owner.id}`}
                className="font-medium text-brand-700 hover:text-brand-900 hover:underline"
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
          <h2 className="font-display text-lg font-semibold text-ink-900">
            Health
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Allergies" value={dog.allergies} />
            <Row label="Medications" value={dog.medications} />
            <Row label="Vet" value={dog.vet_name} />
            <Row label="Vet phone" value={dog.vet_phone} />
          </dl>
          <div className="mt-5 border-t border-stone-200/80 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink-900">Vaccines</h3>
              <Link
                href="/staff/vaccines"
                className="text-xs font-semibold text-brand-700 hover:text-brand-900 hover:underline"
              >
                Review queue →
              </Link>
            </div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {coverage.map((c) => {
                const meta = REQUIRED_VACCINES.find(
                  (v) => v.key === c.vaccineType,
                )!;
                return (
                  <li
                    key={c.vaccineType}
                    className="flex items-center justify-between"
                  >
                    <span className="text-ink-700">{meta.label}</span>
                    <VaccineStatusText coverage={c} />
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="card">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            Care
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Feeding" value={dog.feeding_notes} />
            <Row label="Behavior" value={dog.behavior_notes} />
          </dl>
        </section>
      </div>

      <section className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900">
          Staff-only notes
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          Customers can&apos;t see these.
        </p>
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
        <h2 className="font-display text-xl font-semibold text-ink-900">
          Care log
        </h2>
        <p className="text-sm text-ink-500">
          Meals, meds, potty. Owner can see these entries.
        </p>
        <form action={addDogLogEntry} className="card mt-3 space-y-2">
          <input type="hidden" name="dog_id" value={dog.id} />
          <div className="flex flex-wrap gap-1.5">
            {DOG_LOG_KINDS.map((k) => (
              <button
                key={k.key}
                type="submit"
                name="kind"
                value={k.key}
                className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                {k.emoji} {k.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            name="detail"
            placeholder="Optional detail (e.g. '1 cup kibble', 'gabapentin 100mg')"
            className="input w-full text-sm"
          />
        </form>

        {logEntries.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No entries yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200/80 rounded-2xl border border-stone-200/80 bg-white shadow-soft">
            {logEntries.map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-3 px-5 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="text-ink-900">
                    {DOG_LOG_EMOJI[e.kind]} {DOG_LOG_LABEL[e.kind]}
                    {e.detail && (
                      <span className="text-ink-700"> — {e.detail}</span>
                    )}
                  </p>
                  <p className="text-xs text-ink-500">{formatDate(e.given_at)}</p>
                </div>
                <form action={deleteDogLogEntry}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="dog_id" value={dog.id} />
                  <button
                    type="submit"
                    aria-label="Delete entry"
                    className="rounded-md border border-stone-300 px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-50"
                  >
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold text-ink-900">
          Daily journal
        </h2>
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
          <p className="mt-4 text-sm text-ink-500">No notes yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-stone-200/80 rounded-2xl border border-stone-200/80 bg-white shadow-soft">
            {notes.map((n) => (
              <li key={n.id} className="px-5 py-4">
                <p className="text-xs text-ink-500">
                  {formatDate(n.created_at)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-ink-900">{n.note}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-semibold text-ink-900">
            Incidents
          </h2>
          <Link
            href={`/staff/incidents/new?dog=${dog.id}`}
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            Log incident →
          </Link>
        </div>
        {incidents.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">None on file.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200/80 rounded-2xl border border-stone-200/80 bg-white shadow-soft">
            {incidents.map((i) => (
              <li key={i.id} className="px-5 py-4 text-sm">
                <Link
                  href={`/staff/incidents/${i.id}`}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink-900">
                      {INCIDENT_KIND_LABEL[i.kind]} ·{" "}
                      <span className="font-normal text-ink-500">
                        {formatDateShort(i.occurred_on)}
                      </span>
                    </p>
                    <p className="line-clamp-1 text-ink-700">{i.description}</p>
                  </div>
                  <span
                    className={
                      i.severity === "high"
                        ? "pill-danger"
                        : i.severity === "medium"
                          ? "pill-warn"
                          : "pill-neutral"
                    }
                  >
                    {INCIDENT_SEVERITY_LABEL[i.severity]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold text-ink-900">
          Recent bookings
        </h2>
        {bookings.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">None.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200/80 rounded-2xl border border-stone-200/80 bg-white shadow-soft">
            {bookings.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between px-5 py-3 text-sm"
              >
                <span className="font-medium text-ink-900">
                  {formatDateShort(b.service_date)}
                </span>
                <span className="text-ink-500">
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

function VaccineStatusText({ coverage }: { coverage: VaccineCoverage }) {
  if (coverage.status === "verified") {
    return (
      <span className="pill-success">
        ✓ Expires {formatDateShort(coverage.expiresOn!)}
      </span>
    );
  }
  if (coverage.status === "pending") {
    return <span className="pill-warn">Pending review</span>;
  }
  if (coverage.status === "expired") {
    return (
      <span className="pill-danger">
        Expired {formatDateShort(coverage.expiresOn!)}
      </span>
    );
  }
  if (coverage.status === "rejected") {
    return <span className="pill-danger">Rejected</span>;
  }
  return <span className="pill-neutral">Missing</span>;
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string | null | boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-ink-500">{label}</dt>
      <dd className="col-span-2 text-ink-900">
        {value === null || value === "" ? (
          <span className="text-ink-400">—</span>
        ) : (
          String(value)
        )}
      </dd>
    </div>
  );
}

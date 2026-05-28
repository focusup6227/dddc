import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Dog,
  DogVaccination,
  Profile,
} from "@/lib/supabase/types";
import { formatDate } from "@/lib/format";
import {
  VACCINE_BUCKET,
  VACCINE_LABEL,
} from "@/lib/vaccines";
import { rejectVaccine, verifyVaccine } from "./actions";

export const dynamic = "force-dynamic";

type Row = DogVaccination & {
  dog: Pick<Dog, "id" | "name" | "owner_id"> | null;
  owner: Pick<Profile, "id" | "full_name" | "email"> | null;
  signedUrl: string | null;
};

export default async function StaffVaccinesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const filter = params.filter === "all" ? "all" : "pending";

  const supabase = await createClient();
  let query = supabase
    .from("dog_vaccinations")
    .select("*")
    .order("uploaded_at", { ascending: false })
    .limit(100);
  if (filter === "pending") query = query.eq("status", "pending");
  const { data: vaxData } = await query;
  const vax = (vaxData ?? []) as DogVaccination[];

  const dogIds = Array.from(new Set(vax.map((v) => v.dog_id)));
  const { data: dogData } = dogIds.length
    ? await supabase
        .from("dogs")
        .select("id, name, owner_id")
        .in("id", dogIds)
    : { data: [] as Pick<Dog, "id" | "name" | "owner_id">[] };
  const dogsById = new Map(
    (dogData ?? []).map((d) => [d.id, d as Pick<Dog, "id" | "name" | "owner_id">]),
  );

  const ownerIds = Array.from(
    new Set((dogData ?? []).map((d) => d.owner_id).filter(Boolean) as string[]),
  );
  const { data: ownerData } = ownerIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ownerIds)
    : { data: [] as Pick<Profile, "id" | "full_name" | "email">[] };
  const ownersById = new Map(
    (ownerData ?? []).map((o) => [
      o.id,
      o as Pick<Profile, "id" | "full_name" | "email">,
    ]),
  );

  const signedUrls = await Promise.all(
    vax.map((v) =>
      supabase.storage
        .from(VACCINE_BUCKET)
        .createSignedUrl(v.document_path, 60 * 10)
        .then((r) => r.data?.signedUrl ?? null),
    ),
  );

  const rows: Row[] = vax.map((v, i) => {
    const dog = dogsById.get(v.dog_id) ?? null;
    const owner = dog?.owner_id ? ownersById.get(dog.owner_id) ?? null : null;
    return { ...v, dog, owner, signedUrl: signedUrls[i] };
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Vaccine records</h1>
          <p className="text-stone-600">
            Approve uploaded records so customers can book.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <FilterLink current={filter} value="pending" label="Pending" />
          <FilterLink current={filter} value="all" label="All recent" />
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="card text-stone-600">
          {filter === "pending"
            ? "Nothing pending — you're all caught up."
            : "No vaccine records yet."}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card">
              <VaccineReviewRow row={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterLink({
  current,
  value,
  label,
}: {
  current: string;
  value: string;
  label: string;
}) {
  const active = current === value;
  const cls = active
    ? "rounded-md bg-stone-900 px-3 py-1.5 font-medium text-white"
    : "rounded-md border border-stone-300 px-3 py-1.5 text-stone-700 hover:bg-stone-50";
  return (
    <Link
      href={value === "pending" ? "/staff/vaccines" : `/staff/vaccines?filter=${value}`}
      className={cls}
    >
      {label}
    </Link>
  );
}

function VaccineReviewRow({ row }: { row: Row }) {
  const statusColor =
    row.status === "verified"
      ? "text-emerald-700"
      : row.status === "rejected"
        ? "text-red-700"
        : "text-amber-700";

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-stone-900">
          {VACCINE_LABEL[row.vaccine_type]} ·{" "}
          <Link
            href={row.dog ? `/staff/dogs/${row.dog.id}` : "#"}
            className="text-brand-700 hover:underline"
          >
            {row.dog?.name ?? "Unknown dog"}
          </Link>
        </p>
        <p className="text-sm text-stone-600">
          {row.owner?.full_name || row.owner?.email || "—"}
        </p>
        <p className="mt-1 text-xs text-stone-500">
          Uploaded {formatDate(row.uploaded_at)} · Expires{" "}
          {formatDate(row.expires_on)}
        </p>
        <p className={`mt-1 text-xs font-medium uppercase tracking-wide ${statusColor}`}>
          {row.status}
          {row.status === "rejected" && row.rejection_reason && (
            <span className="ml-2 font-normal normal-case text-stone-600">
              — {row.rejection_reason}
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        {row.signedUrl ? (
          <a
            href={row.signedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            View document →
          </a>
        ) : (
          <span className="text-xs text-stone-500">Document unavailable</span>
        )}
        {row.status === "pending" && (
          <div className="flex items-center gap-2">
            <form action={verifyVaccine}>
              <input type="hidden" name="id" value={row.id} />
              <button type="submit" className="btn-primary text-sm">
                Verify
              </button>
            </form>
            <form action={rejectVaccine} className="flex items-center gap-1">
              <input type="hidden" name="id" value={row.id} />
              <input
                type="text"
                name="reason"
                placeholder="Reason (optional)"
                className="input w-44 text-sm"
              />
              <button
                type="submit"
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Reject
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

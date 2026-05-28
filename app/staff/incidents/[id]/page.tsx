import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Dog,
  Incident,
  IncidentPhoto,
  Profile,
} from "@/lib/supabase/types";
import { formatDate, formatDateShort } from "@/lib/format";
import {
  INCIDENT_BUCKET,
  INCIDENT_KINDS,
  INCIDENT_SEVERITIES,
} from "@/lib/incidents";
import { IncidentPhotosEditor } from "./PhotosEditor";
import { deleteIncident, updateIncident } from "../actions";

export const dynamic = "force-dynamic";

export default async function StaffIncidentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const { saved } = await searchParams;
  const supabase = await createClient();

  const { data: incident } = await supabase
    .from("incidents")
    .select("*")
    .eq("id", id)
    .maybeSingle<Incident>();
  if (!incident) notFound();

  const [dogRes, photoRes, reporterRes] = await Promise.all([
    supabase
      .from("dogs")
      .select("id, name, owner_id")
      .eq("id", incident.dog_id)
      .maybeSingle<Pick<Dog, "id" | "name" | "owner_id">>(),
    supabase
      .from("incident_photos")
      .select("*")
      .eq("incident_id", id)
      .order("uploaded_at"),
    incident.reporter_id
      ? supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("id", incident.reporter_id)
          .maybeSingle<Pick<Profile, "id" | "full_name" | "email">>()
      : Promise.resolve({ data: null }),
  ]);
  const dog = dogRes.data;
  const reporter = reporterRes.data;
  const photos = (photoRes.data ?? []) as IncidentPhoto[];

  const ownerRes = dog
    ? await supabase
        .from("profiles")
        .select("id, full_name, email, phone")
        .eq("id", dog.owner_id)
        .maybeSingle<Pick<Profile, "id" | "full_name" | "email" | "phone">>()
    : { data: null };
  const owner = ownerRes.data;

  const signedUrls = await Promise.all(
    photos.map((p) =>
      supabase.storage
        .from(INCIDENT_BUCKET)
        .createSignedUrl(p.storage_path, 60 * 10)
        .then((r) => r.data?.signedUrl ?? null),
    ),
  );
  const displayPhotos = photos.map((p, i) => ({
    id: p.id,
    storage_path: p.storage_path,
    caption: p.caption,
    signed_url: signedUrls[i],
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Incident</h1>
          {dog && (
            <p className="text-stone-600">
              <Link
                href={`/staff/dogs/${dog.id}`}
                className="text-brand-700 hover:underline"
              >
                {dog.name}
              </Link>
              {owner && (
                <>
                  {" · "}
                  <Link
                    href={`/staff/customers/${owner.id}`}
                    className="text-brand-700 hover:underline"
                  >
                    {owner.full_name || owner.email}
                  </Link>
                  {owner.phone ? ` · ${owner.phone}` : ""}
                </>
              )}
            </p>
          )}
        </div>
        <Link href="/staff/incidents" className="text-sm text-stone-600 hover:underline">
          ← Back to incidents
        </Link>
      </header>

      {saved && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved.
        </div>
      )}

      <form action={updateIncident} className="card space-y-4">
        <input type="hidden" name="id" value={incident.id} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="occurred_on" className="label">Date</label>
            <input
              id="occurred_on"
              name="occurred_on"
              type="date"
              defaultValue={incident.occurred_on}
              required
              className="input"
            />
          </div>
          <div>
            <label htmlFor="kind" className="label">Type</label>
            <select id="kind" name="kind" defaultValue={incident.kind} className="input">
              {INCIDENT_KINDS.map((k) => (
                <option key={k.key} value={k.key}>{k.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="severity" className="label">Severity</label>
            <select id="severity" name="severity" defaultValue={incident.severity} className="input">
              {INCIDENT_SEVERITIES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="description" className="label">Description</label>
          <textarea
            id="description"
            name="description"
            rows={6}
            required
            defaultValue={incident.description}
            className="input"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4">
          <div className="text-sm text-stone-600">
            {incident.customer_notified_at ? (
              <>
                <span className="font-medium text-emerald-700">
                  Owner notified
                </span>{" "}
                · {formatDate(incident.customer_notified_at)}
              </>
            ) : (
              <span className="text-amber-700 font-medium">Owner not notified</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              name="toggle_notified"
              value={incident.customer_notified_at ? "clear" : "set"}
              className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              {incident.customer_notified_at ? "Mark not notified" : "Mark as notified"}
            </button>
            <button type="submit" className="btn-primary">Save changes</button>
          </div>
        </div>
      </form>

      <IncidentPhotosEditor incidentId={incident.id} photos={displayPhotos} />

      <section className="card text-sm text-stone-500">
        <p>
          Logged {formatDate(incident.created_at)}
          {reporter ? ` by ${reporter.full_name || reporter.email}` : ""}.
        </p>
        {incident.occurred_on !== incident.created_at.slice(0, 10) && (
          <p>Occurred {formatDateShort(incident.occurred_on)}.</p>
        )}
      </section>

      <section className="card">
        <h2 className="font-semibold text-red-700">Danger zone</h2>
        <p className="mt-1 text-sm text-stone-600">
          Delete this incident and all attached photos. Cannot be undone.
        </p>
        <form action={deleteIncident} className="mt-3">
          <input type="hidden" name="id" value={incident.id} />
          <button
            type="submit"
            className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete incident
          </button>
        </form>
      </section>
    </div>
  );
}

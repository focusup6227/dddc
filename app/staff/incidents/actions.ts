"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireFullStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { IncidentKind, IncidentSeverity } from "@/lib/supabase/types";
import { INCIDENT_BUCKET } from "@/lib/incidents";

function str(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

const KINDS: ReadonlySet<IncidentKind> = new Set([
  "bite",
  "injury",
  "escape",
  "illness",
  "property_damage",
  "other",
]);
const SEVERITIES: ReadonlySet<IncidentSeverity> = new Set([
  "low",
  "medium",
  "high",
]);

export async function createIncident(formData: FormData) {
  const { userId } = await requireFullStaff();

  const dog_id = str(formData.get("dog_id"));
  const occurred_on = str(formData.get("occurred_on"));
  const kindRaw = str(formData.get("kind"));
  const severityRaw = str(formData.get("severity")) ?? "low";
  const description = str(formData.get("description"));
  const notify = formData.get("customer_notified") === "yes";

  if (!dog_id || !occurred_on || !kindRaw || !description) {
    redirect(
      "/staff/incidents/new?error=" +
        encodeURIComponent("Dog, date, type, and description are required."),
    );
  }
  if (!KINDS.has(kindRaw as IncidentKind)) {
    redirect("/staff/incidents/new?error=Invalid+type.");
  }
  if (!SEVERITIES.has(severityRaw as IncidentSeverity)) {
    redirect("/staff/incidents/new?error=Invalid+severity.");
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("incidents")
    .insert({
      dog_id,
      occurred_on,
      kind: kindRaw as IncidentKind,
      severity: severityRaw as IncidentSeverity,
      description,
      reporter_id: userId,
      customer_notified_at: notify ? new Date().toISOString() : null,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !inserted) {
    redirect(
      "/staff/incidents/new?error=" +
        encodeURIComponent(error?.message ?? "Could not save."),
    );
  }

  revalidatePath("/staff/incidents");
  revalidatePath(`/staff/dogs/${dog_id}`);
  redirect(`/staff/incidents/${inserted.id}`);
}

export async function updateIncident(formData: FormData) {
  await requireFullStaff();

  const id = str(formData.get("id"));
  if (!id) redirect("/staff/incidents");

  const supabase = await createClient();
  const payload: Record<string, string | null | boolean> = {};

  const occurred_on = str(formData.get("occurred_on"));
  if (occurred_on) payload.occurred_on = occurred_on;

  const kindRaw = str(formData.get("kind"));
  if (kindRaw && KINDS.has(kindRaw as IncidentKind)) payload.kind = kindRaw;

  const severityRaw = str(formData.get("severity"));
  if (severityRaw && SEVERITIES.has(severityRaw as IncidentSeverity))
    payload.severity = severityRaw;

  const description = str(formData.get("description"));
  if (description !== null) payload.description = description;

  const notifyToggle = str(formData.get("toggle_notified"));
  if (notifyToggle === "set") {
    payload.customer_notified_at = new Date().toISOString();
  } else if (notifyToggle === "clear") {
    payload.customer_notified_at = null;
  }

  await supabase.from("incidents").update(payload).eq("id", id);

  revalidatePath("/staff/incidents");
  revalidatePath(`/staff/incidents/${id}`);
  redirect(`/staff/incidents/${id}?saved=1`);
}

export async function deleteIncident(formData: FormData) {
  await requireFullStaff();
  const id = str(formData.get("id"));
  if (!id) redirect("/staff/incidents");

  const supabase = await createClient();
  // Clean up storage objects for any attached photos.
  const { data: photos } = await supabase
    .from("incident_photos")
    .select("storage_path")
    .eq("incident_id", id);
  const paths = (photos ?? []).map((p) => p.storage_path);
  if (paths.length > 0) {
    await supabase.storage.from(INCIDENT_BUCKET).remove(paths);
  }

  await supabase.from("incidents").delete().eq("id", id);
  revalidatePath("/staff/incidents");
  redirect("/staff/incidents");
}

export async function addIncidentPhoto(formData: FormData) {
  const { userId } = await requireFullStaff();
  const incident_id = str(formData.get("incident_id"));
  const storage_path = str(formData.get("storage_path"));
  const caption = str(formData.get("caption"));
  if (!incident_id || !storage_path) return;

  const supabase = await createClient();
  await supabase.from("incident_photos").insert({
    incident_id,
    storage_path,
    caption,
    uploaded_by: userId,
  });
  revalidatePath(`/staff/incidents/${incident_id}`);
}

export async function deleteIncidentPhoto(formData: FormData) {
  await requireFullStaff();
  const incident_id = str(formData.get("incident_id"));
  const photo_id = str(formData.get("photo_id"));
  const storage_path = str(formData.get("storage_path"));
  if (!incident_id || !photo_id) return;

  const supabase = await createClient();
  if (storage_path) {
    await supabase.storage.from(INCIDENT_BUCKET).remove([storage_path]);
  }
  await supabase.from("incident_photos").delete().eq("id", photo_id);
  revalidatePath(`/staff/incidents/${incident_id}`);
}

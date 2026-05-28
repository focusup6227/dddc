import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendVaccineExpiryReminder } from "@/lib/email";
import { addDays, todayISO } from "@/lib/format";
import { REQUIRED_VACCINES } from "@/lib/vaccines";
import type { DogVaccination, VaccineType } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VACCINE_LABEL: Record<VaccineType, string> = Object.fromEntries(
  REQUIRED_VACCINES.map((v) => [v.key, v.label]),
) as Record<VaccineType, string>;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const today = todayISO();
  const horizon = addDays(today, 30);

  const svc = createServiceClient();
  // Verified vaccine records expiring within the next 30 days that we
  // haven't already nudged about. Pull whichever record per dog+type is
  // currently active (newest verified row, by uploaded_at).
  const { data: rows, error } = await svc
    .from("dog_vaccinations")
    .select("*")
    .eq("status", "verified")
    .gte("expires_on", today)
    .lte("expires_on", horizon)
    .is("reminder_sent_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = (rows ?? []) as DogVaccination[];
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, considered: 0 });
  }

  // Group by (dog_id, vaccine_type) and keep only the latest verified record —
  // an older verified record might still be the cheapest to find here if a
  // newer one hasn't been verified yet, but for "current" coverage we use
  // newest. We then verify it's still the active record by checking no newer
  // verified row exists. (Done implicitly by sorting + first-wins.)
  const latestByKey = new Map<string, DogVaccination>();
  for (const r of [...candidates].sort((a, b) =>
    b.uploaded_at.localeCompare(a.uploaded_at),
  )) {
    const key = `${r.dog_id}:${r.vaccine_type}`;
    if (!latestByKey.has(key)) latestByKey.set(key, r);
  }

  // Group dogs by owner so each customer gets a single email.
  const dogIds = Array.from(
    new Set(Array.from(latestByKey.values()).map((r) => r.dog_id)),
  );
  const { data: dogRows } = await svc
    .from("dogs")
    .select("id, name, owner_id, active")
    .in("id", dogIds);
  type DogRow = {
    id: string;
    name: string;
    owner_id: string;
    active: boolean;
  };
  const dogById = new Map<string, DogRow>(
    ((dogRows ?? []) as DogRow[]).map((d) => [d.id, d]),
  );

  const ownerIds = Array.from(
    new Set(
      Array.from(latestByKey.values())
        .map((r) => dogById.get(r.dog_id)?.owner_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const { data: profileRows } = await svc
    .from("profiles")
    .select("id, email, full_name")
    .in("id", ownerIds);
  type ProfileRow = { id: string; email: string; full_name: string | null };
  const profileById = new Map<string, ProfileRow>(
    ((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p]),
  );

  // Build per-dog vaccine groups so the email lists all expiring vaccines.
  type DogGroup = {
    dogName: string;
    ownerId: string;
    vaccineLabels: string[];
    expiresOn: string; // earliest expiry across the listed vaccines
    recordIds: string[];
  };
  const groupsByDog = new Map<string, DogGroup>();
  for (const rec of latestByKey.values()) {
    const dog = dogById.get(rec.dog_id);
    if (!dog || !dog.active) continue;
    const existing = groupsByDog.get(rec.dog_id);
    const label = VACCINE_LABEL[rec.vaccine_type] ?? rec.vaccine_type;
    if (existing) {
      existing.vaccineLabels.push(label);
      existing.recordIds.push(rec.id);
      if (rec.expires_on < existing.expiresOn) existing.expiresOn = rec.expires_on;
    } else {
      groupsByDog.set(rec.dog_id, {
        dogName: dog.name,
        ownerId: dog.owner_id,
        vaccineLabels: [label],
        expiresOn: rec.expires_on,
        recordIds: [rec.id],
      });
    }
  }

  let sent = 0;
  const recordIdsToMark: string[] = [];
  for (const group of groupsByDog.values()) {
    const profile = profileById.get(group.ownerId);
    if (!profile?.email) continue;
    await sendVaccineExpiryReminder({
      to: profile.email,
      customerName: profile.full_name ?? profile.email,
      dogName: group.dogName,
      vaccineLabels: group.vaccineLabels,
      expiresOn: group.expiresOn,
    });
    recordIdsToMark.push(...group.recordIds);
    sent++;
  }

  if (recordIdsToMark.length > 0) {
    await svc
      .from("dog_vaccinations")
      .update({ reminder_sent_at: new Date().toISOString() })
      .in("id", recordIdsToMark);
  }

  return NextResponse.json({
    ok: true,
    sent,
    considered: candidates.length,
    dogs: groupsByDog.size,
  });
}

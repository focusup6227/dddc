"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { REQUIRED_VACCINES, VACCINE_BUCKET, type VaccineCoverage } from "@/lib/vaccines";
import type { VaccineType } from "@/lib/supabase/types";
import { formatDate } from "@/lib/format";
import { saveVaccineRecord, deleteVaccineRecord } from "./vaccineActions";

export function VaccinesPanel({
  dogId,
  ownerId,
  coverage,
}: {
  dogId: string;
  ownerId: string;
  coverage: VaccineCoverage[];
}) {
  return (
    <section className="card space-y-5">
      <header>
        <h2 className="text-lg font-semibold text-stone-900">Vaccine records</h2>
        <p className="mt-1 text-sm text-stone-600">
          We need a current Rabies, DHPP, and Bordetella record on file before
          you can book. Upload a clear photo or PDF of each certificate from
          your vet. We&apos;ll review within a day.
        </p>
      </header>

      <ul className="divide-y divide-stone-200">
        {coverage.map((c) => {
          const meta = REQUIRED_VACCINES.find((v) => v.key === c.vaccineType)!;
          return (
            <li key={c.vaccineType} className="py-4 first:pt-0 last:pb-0">
              <VaccineRow
                dogId={dogId}
                ownerId={ownerId}
                vaccineType={c.vaccineType}
                label={meta.label}
                description={meta.description}
                coverage={c}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function VaccineRow({
  dogId,
  ownerId,
  vaccineType,
  label,
  description,
  coverage,
}: {
  dogId: string;
  ownerId: string;
  vaccineType: VaccineType;
  label: string;
  description: string;
  coverage: VaccineCoverage;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(coverage.status === "missing");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    setError(null);
    const file = formData.get("file") as File | null;
    const expires_on = String(formData.get("expires_on") ?? "");
    if (!file || file.size === 0) {
      setError("Please attach a file.");
      return;
    }
    if (!expires_on) {
      setError("Please enter the expiration date.");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const key = `${ownerId}/${dogId}/${vaccineType}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(VACCINE_BUCKET)
        .upload(key, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const payload = new FormData();
      payload.set("dog_id", dogId);
      payload.set("vaccine_type", vaccineType);
      payload.set("document_path", key);
      payload.set("expires_on", expires_on);

      const result = await saveVaccineRecord(payload);
      if (!result.ok) {
        // Clean up the orphan file if the DB insert was rejected.
        await supabase.storage.from(VACCINE_BUCKET).remove([key]);
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-stone-900">{label}</p>
            <StatusPill status={coverage.status} />
          </div>
          <p className="text-xs text-stone-500">{description}</p>
          {coverage.current && (
            <p className="mt-1 text-xs text-stone-600">
              {coverage.status === "expired"
                ? "Expired "
                : coverage.status === "rejected"
                  ? "Rejected"
                  : "Expires "}
              {coverage.expiresOn && coverage.status !== "rejected" && (
                <span className="font-medium">{formatDate(coverage.expiresOn)}</span>
              )}
              {coverage.status === "rejected" && coverage.current.rejection_reason && (
                <> — {coverage.current.rejection_reason}</>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {coverage.current && coverage.status !== "missing" && (
            <form
              action={(fd) => startTransition(() => deleteVaccineRecord(fd))}
            >
              <input type="hidden" name="id" value={coverage.current.id} />
              <input type="hidden" name="dog_id" value={dogId} />
              <button
                type="submit"
                disabled={pending}
                className="text-xs font-medium text-stone-500 hover:text-red-600"
              >
                Remove
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            {open ? "Cancel" : coverage.status === "missing" ? "Upload" : "Replace"}
          </button>
        </div>
      </div>

      {open && (
        <form
          action={handleSubmit}
          className="rounded-md border border-stone-200 bg-stone-50 p-3 space-y-3"
        >
          <div>
            <label className="label" htmlFor={`file-${vaccineType}`}>
              Vaccine certificate (PDF or image)
            </label>
            <input
              id={`file-${vaccineType}`}
              name="file"
              type="file"
              accept="image/*,application/pdf"
              required
              className="block text-sm"
              disabled={uploading}
            />
          </div>
          <div>
            <label className="label" htmlFor={`exp-${vaccineType}`}>
              Expiration date
            </label>
            <input
              id={`exp-${vaccineType}`}
              name="expires_on"
              type="date"
              required
              className="input"
              disabled={uploading}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={uploading}
              className="btn-primary text-sm"
            >
              {uploading ? "Uploading…" : "Submit for review"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: VaccineCoverage["status"] }) {
  const map: Record<VaccineCoverage["status"], { label: string; cls: string }> = {
    verified: {
      label: "Verified",
      cls: "bg-emerald-100 text-emerald-800 border-emerald-200",
    },
    pending: {
      label: "Pending review",
      cls: "bg-amber-100 text-amber-800 border-amber-200",
    },
    expired: {
      label: "Expired",
      cls: "bg-red-100 text-red-800 border-red-200",
    },
    rejected: {
      label: "Rejected",
      cls: "bg-red-100 text-red-800 border-red-200",
    },
    missing: {
      label: "Missing",
      cls: "bg-stone-100 text-stone-700 border-stone-200",
    },
  };
  const { label, cls } = map[status];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

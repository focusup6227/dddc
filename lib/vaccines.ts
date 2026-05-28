import type { DogVaccination, VaccineType } from "@/lib/supabase/types";
import { todayISO } from "@/lib/format";

export const REQUIRED_VACCINES: ReadonlyArray<{
  key: VaccineType;
  label: string;
  description: string;
}> = [
  {
    key: "rabies",
    label: "Rabies",
    description: "Required by law. 1- or 3-year vaccine.",
  },
  {
    key: "dhpp",
    label: "DHPP / DA2PP",
    description: "Distemper, Adenovirus, Parainfluenza, Parvovirus.",
  },
  {
    key: "bordetella",
    label: "Bordetella",
    description: "Kennel cough. Required for group play.",
  },
];

export const VACCINE_BUCKET = "vaccine-records";

export const VACCINE_LABEL: Record<VaccineType, string> = Object.fromEntries(
  REQUIRED_VACCINES.map((v) => [v.key, v.label]),
) as Record<VaccineType, string>;

export type VaccineCoverage = {
  vaccineType: VaccineType;
  current: DogVaccination | null;
  status: "missing" | "pending" | "verified" | "expired" | "rejected";
  expiresOn: string | null;
};

/**
 * Per-vaccine picker: prefer verified, then pending, then rejected.
 */
export function summarizeCoverage(
  records: DogVaccination[],
  asOf: string = todayISO(),
): VaccineCoverage[] {
  return REQUIRED_VACCINES.map(({ key }) => {
    const forType = records
      .filter((r) => r.vaccine_type === key)
      .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));

    const verified = forType.find((r) => r.status === "verified") ?? null;
    const pending = forType.find((r) => r.status === "pending") ?? null;
    const rejected = forType.find((r) => r.status === "rejected") ?? null;
    const current = verified ?? pending ?? rejected;

    let status: VaccineCoverage["status"];
    if (!current) status = "missing";
    else if (current.status === "rejected") status = "rejected";
    else if (current.expires_on < asOf) status = "expired";
    else if (current.status === "verified") status = "verified";
    else status = "pending";

    return {
      vaccineType: key,
      current,
      status,
      expiresOn: current?.expires_on ?? null,
    };
  });
}

export function isFullyCovered(
  coverage: VaccineCoverage[],
  asOf: string = todayISO(),
): boolean {
  return coverage.every(
    (c) =>
      c.current?.status === "verified" && c.current.expires_on >= asOf,
  );
}

export function missingForBooking(
  coverage: VaccineCoverage[],
  asOf: string = todayISO(),
): VaccineType[] {
  return coverage
    .filter(
      (c) =>
        !(c.current?.status === "verified" && c.current.expires_on >= asOf),
    )
    .map((c) => c.vaccineType);
}

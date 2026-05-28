import type { IncidentKind, IncidentSeverity } from "@/lib/supabase/types";

export const INCIDENT_KINDS: ReadonlyArray<{
  key: IncidentKind;
  label: string;
}> = [
  { key: "bite", label: "Bite" },
  { key: "injury", label: "Injury" },
  { key: "escape", label: "Escape attempt" },
  { key: "illness", label: "Illness" },
  { key: "property_damage", label: "Property damage" },
  { key: "other", label: "Other" },
];

export const INCIDENT_KIND_LABEL: Record<IncidentKind, string> = Object.fromEntries(
  INCIDENT_KINDS.map((k) => [k.key, k.label]),
) as Record<IncidentKind, string>;

export const INCIDENT_SEVERITIES: ReadonlyArray<{
  key: IncidentSeverity;
  label: string;
}> = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
];

export const INCIDENT_SEVERITY_LABEL: Record<IncidentSeverity, string> =
  Object.fromEntries(
    INCIDENT_SEVERITIES.map((s) => [s.key, s.label]),
  ) as Record<IncidentSeverity, string>;

export const INCIDENT_BUCKET = "incident-photos";

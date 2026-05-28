import type { DogLogKind } from "@/lib/supabase/types";

export const DOG_LOG_KINDS: { key: DogLogKind; label: string; emoji: string }[] =
  [
    { key: "meal", label: "Meal", emoji: "🍽️" },
    { key: "medication", label: "Medication", emoji: "💊" },
    { key: "potty", label: "Potty", emoji: "🐾" },
    { key: "water", label: "Water", emoji: "💧" },
    { key: "rest", label: "Rest", emoji: "💤" },
  ];

export const DOG_LOG_LABEL: Record<DogLogKind, string> = Object.fromEntries(
  DOG_LOG_KINDS.map((k) => [k.key, k.label]),
) as Record<DogLogKind, string>;

export const DOG_LOG_EMOJI: Record<DogLogKind, string> = Object.fromEntries(
  DOG_LOG_KINDS.map((k) => [k.key, k.emoji]),
) as Record<DogLogKind, string>;

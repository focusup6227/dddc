import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { Belonging } from "@/lib/supabase/types";

type Svc = ReturnType<typeof createServiceClient>;

// The common items owners drop off, surfaced as one-tap chips at the kiosk so
// staff rarely have to type. Free text covers anything unusual.
export const QUICK_ADD_BELONGINGS = [
  "Leash",
  "Collar",
  "Bed",
  "Blanket",
  "Food + scoop",
  "Bowl",
  "Toy",
  "Medication",
  "Crate",
  "Coat / sweater",
] as const;

/** All belongings on a booking, oldest-logged first. */
export async function getBelongings(
  svc: Svc,
  bookingId: string,
): Promise<Belonging[]> {
  const { data } = await svc
    .from("booking_belongings")
    .select("*")
    .eq("booking_id", bookingId)
    .order("checked_in_at");
  return (data ?? []) as Belonging[];
}

/** Log a single item dropped off with the dog on this booking. */
export async function addBelonging(
  svc: Svc,
  args: {
    bookingId: string;
    dogId: string;
    customerId: string;
    label: string;
    quantity?: number;
    notes?: string | null;
    staffId: string;
  },
) {
  await svc.from("booking_belongings").insert({
    booking_id: args.bookingId,
    dog_id: args.dogId,
    customer_id: args.customerId,
    label: args.label,
    quantity: args.quantity && args.quantity > 0 ? args.quantity : 1,
    notes: args.notes ?? null,
    checked_in_by: args.staffId,
  });
}

export async function removeBelonging(svc: Svc, id: string) {
  await svc.from("booking_belongings").delete().eq("id", id);
}

/**
 * Flip a single item between returned and still-here. Pass `returned: false`
 * to undo a mistaken "returned" tap.
 */
export async function setBelongingReturned(
  svc: Svc,
  args: { id: string; returned: boolean; staffId: string },
) {
  await svc
    .from("booking_belongings")
    .update(
      args.returned
        ? { returned_at: new Date().toISOString(), returned_by: args.staffId }
        : { returned_at: null, returned_by: null },
    )
    .eq("id", args.id);
}

/** Mark every still-here item on a booking returned in one tap (at pickup). */
export async function returnAllBelongings(
  svc: Svc,
  args: { bookingId: string; staffId: string },
) {
  await svc
    .from("booking_belongings")
    .update({
      returned_at: new Date().toISOString(),
      returned_by: args.staffId,
    })
    .eq("booking_id", args.bookingId)
    .is("returned_at", null);
}

/**
 * The distinct item labels a dog brought on its most recent prior booking, so a
 * regular's usual items can be prefilled in one tap instead of re-typed. Looks
 * only at OTHER bookings (not the one being filled) and returns each label once,
 * carrying the quantity from its latest appearance.
 */
export async function lastStayBelongings(
  svc: Svc,
  args: { dogId: string; excludeBookingId: string },
): Promise<{ label: string; quantity: number }[]> {
  const { data } = await svc
    .from("booking_belongings")
    .select("booking_id, label, quantity, checked_in_at")
    .eq("dog_id", args.dogId)
    .neq("booking_id", args.excludeBookingId)
    .order("checked_in_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as {
    booking_id: string;
    label: string;
    quantity: number;
    checked_in_at: string;
  }[];
  if (rows.length === 0) return [];

  // Restrict to the single most recent prior booking — "last visit", not a
  // union of everything they've ever brought.
  const lastBookingId = rows[0].booking_id;
  const seen = new Set<string>();
  const items: { label: string; quantity: number }[] = [];
  for (const r of rows) {
    if (r.booking_id !== lastBookingId) continue;
    const key = r.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ label: r.label, quantity: r.quantity });
  }
  return items;
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { addDays, todayISO } from "@/lib/format";
import { getBoardingRateCents, getFullDates } from "@/lib/settings";
import { getBlackoutDates } from "@/lib/blackouts.server";
import { assertDogReadyToBook } from "@/lib/vaccines.server";
import { getPastDueUnpaid } from "@/lib/bookings.server";
import { sendWaitlistOffer } from "@/lib/email";
import type { Package, ServiceKind, WaitlistEntry } from "@/lib/supabase/types";

type Svc = ReturnType<typeof createServiceClient>;

// How long the first person in line has to claim a freed spot before it rolls
// to the next person. Short on purpose — a freed spot is scarce.
export const OFFER_WINDOW_HOURS = 12;

/** Every date in the half-open span [start, end). */
export function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  while (cur < end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** The per-unit price a held offer booking should carry for this kind. */
async function unitPriceForKind(
  svc: Svc,
  kind: ServiceKind,
): Promise<number | null> {
  if (kind === "boarding") return getBoardingRateCents();
  const { data: dropInPkg } = await svc
    .from("packages")
    .select("*")
    .eq("active", true)
    .eq("days_included", 1)
    .order("price_cents")
    .limit(1)
    .maybeSingle<Package>();
  return dropInPkg?.price_cents ?? null;
}

export type JoinResult = { ok: true } | { ok: false; error: string };

/**
 * Put a customer's dog in line for a full span. Refuses spans that are already
 * open (just book those), spans the dog is already booked for, and duplicate
 * line entries.
 */
export async function createWaitlistEntry(args: {
  customerId: string;
  dogId: string;
  kind: ServiceKind;
  serviceDate: string;
  serviceEndDate: string;
}): Promise<JoinResult> {
  const { customerId, dogId, kind, serviceDate, serviceEndDate } = args;
  if (serviceEndDate <= serviceDate) {
    return { ok: false, error: "Pick a valid date range." };
  }
  const svc = createServiceClient();

  const { data: dog } = await svc
    .from("dogs")
    .select("id")
    .eq("id", dogId)
    .eq("owner_id", customerId)
    .maybeSingle<{ id: string }>();
  if (!dog) return { ok: false, error: "Dog not found." };

  const today = todayISO();
  const dates = enumerateDates(serviceDate, serviceEndDate).filter(
    (d) => d >= today,
  );
  if (dates.length === 0) {
    return { ok: false, error: "Those dates have already passed." };
  }

  // Only waitlist when at least one requested date is actually full — otherwise
  // the customer should just book it.
  const full = await getFullDates(dates, kind);
  if (!dates.some((d) => full.has(d))) {
    return {
      ok: false,
      error: "Those dates are open — you can book them directly.",
    };
  }

  // Don't let a dog wait for a span it's already booked into.
  const { data: clash } = await svc
    .from("bookings")
    .select("id")
    .eq("dog_id", dogId)
    .eq("service_kind", kind)
    .lt("service_date", serviceEndDate)
    .gt("service_end_date", serviceDate)
    .neq("status", "canceled")
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (clash) {
    return { ok: false, error: "This dog is already booked for those dates." };
  }

  const { error } = await svc.from("waitlist_entries").insert({
    customer_id: customerId,
    dog_id: dogId,
    service_kind: kind,
    service_date: serviceDate,
    service_end_date: serviceEndDate,
  });
  if (error) {
    if (error.message.toLowerCase().includes("duplicate")) {
      return { ok: false, error: "You're already on the waitlist for those dates." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Leave the waitlist (or decline a live offer). Cancels the held offer booking
 * too, freeing the spot for the next person.
 */
export async function cancelWaitlistEntry(args: {
  entryId: string;
  customerId: string;
}): Promise<{ kind: ServiceKind; dates: string[] } | null> {
  const svc = createServiceClient();
  const { data: entry } = await svc
    .from("waitlist_entries")
    .select("*")
    .eq("id", args.entryId)
    .eq("customer_id", args.customerId)
    .maybeSingle<WaitlistEntry>();
  if (!entry || (entry.status !== "waiting" && entry.status !== "offered")) {
    return null;
  }

  let freed: { kind: ServiceKind; dates: string[] } | null = null;
  if (entry.status === "offered" && entry.offered_booking_id) {
    // Decline: drop the held booking so the spot reopens for the next person.
    const { data: held } = await svc
      .from("bookings")
      .select("payment_status, status")
      .eq("id", entry.offered_booking_id)
      .maybeSingle<{ payment_status: string; status: string }>();
    if (held && held.payment_status !== "paid" && held.status !== "canceled") {
      await svc
        .from("bookings")
        .update({
          status: "canceled",
          canceled_at: new Date().toISOString(),
          cancellation_reason: "Waitlist offer declined",
          waitlist_offer_expires_at: null,
        })
        .eq("id", entry.offered_booking_id);
      freed = {
        kind: entry.service_kind,
        dates: enumerateDates(entry.service_date, entry.service_end_date),
      };
    }
  }

  await svc
    .from("waitlist_entries")
    .update({ status: "canceled" })
    .eq("id", entry.id);
  return freed;
}

/**
 * Offer freed spots to the people in line, oldest first. For each waiting entry
 * whose whole span is now available (and whose dog is eligible), create a held
 * offer booking and email the customer. Because each held booking consumes a
 * spot, the next entry in line correctly sees the day as full again — so a
 * single freed spot is offered to exactly one person.
 *
 * Pass `freedDates` to limit work to entries touching those dates (the common
 * case after one cancellation); omit it to sweep every waiting entry.
 */
export async function processWaitlist(
  kind: ServiceKind,
  freedDates?: string[],
): Promise<number> {
  const svc = createServiceClient();
  const today = todayISO();

  const { data: rows } = await svc
    .from("waitlist_entries")
    .select("*")
    .eq("service_kind", kind)
    .eq("status", "waiting")
    .order("created_at");
  const entries = (rows ?? []) as WaitlistEntry[];

  let offered = 0;
  for (const e of entries) {
    const dates = enumerateDates(e.service_date, e.service_end_date).filter(
      (d) => d >= today,
    );
    if (dates.length === 0) {
      // The span has passed entirely — retire the entry.
      await svc
        .from("waitlist_entries")
        .update({ status: "expired" })
        .eq("id", e.id);
      continue;
    }
    if (freedDates && !dates.some((d) => freedDates.includes(d))) continue;

    // Still no room?
    const full = await getFullDates(dates, kind);
    if (dates.some((d) => full.has(d))) continue;

    // We closed on one of the dates since they joined.
    const black = await getBlackoutDates(dates[0], dates[dates.length - 1], kind);
    if (dates.some((d) => black.has(d))) continue;

    // Dog's vaccines must still be valid through the last date.
    const vax = await assertDogReadyToBook(e.dog_id, dates[dates.length - 1]);
    if (!vax.ok) continue;

    // Don't offer to someone who owes us for a completed stay.
    const pastDue = await getPastDueUnpaid(e.customer_id);
    if (pastDue.length > 0) continue;

    const unitPrice = await unitPriceForKind(svc, kind);
    if (unitPrice == null) continue; // no rate configured — can't price the hold

    const offerExpires = new Date(
      Date.now() + OFFER_WINDOW_HOURS * 3_600_000,
    ).toISOString();

    const { data: inserted, error } = await svc
      .from("bookings")
      .insert({
        customer_id: e.customer_id,
        dog_id: e.dog_id,
        service_date: e.service_date,
        service_end_date: e.service_end_date,
        service_kind: kind,
        status: "reserved",
        payment_kind: "drop_in",
        unit_price_cents: unitPrice,
        payment_status: "unpaid",
        waitlist_offer_expires_at: offerExpires,
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error || !inserted) {
      // Most likely the dog already has a booking that day — they're set, so
      // close the entry rather than retry forever.
      if (error?.message.toLowerCase().includes("duplicate")) {
        await svc
          .from("waitlist_entries")
          .update({ status: "canceled" })
          .eq("id", e.id);
      }
      continue;
    }

    await svc
      .from("waitlist_entries")
      .update({
        status: "offered",
        offered_booking_id: inserted.id,
        offer_expires_at: offerExpires,
        offered_at: new Date().toISOString(),
      })
      .eq("id", e.id);

    const [{ data: profile }, { data: dog }] = await Promise.all([
      svc
        .from("profiles")
        .select("email, full_name")
        .eq("id", e.customer_id)
        .maybeSingle<{ email: string; full_name: string | null }>(),
      svc.from("dogs").select("name").eq("id", e.dog_id).maybeSingle<{ name: string }>(),
    ]);
    if (profile?.email) {
      await sendWaitlistOffer({
        to: profile.email,
        customerName: profile.full_name ?? profile.email,
        dogName: dog?.name ?? "your dog",
        serviceKind: kind,
        dates,
        expiresAt: offerExpires,
      });
    }
    offered += 1;
  }
  return offered;
}

/**
 * Cancel offers whose claim window lapsed unpaid (freeing their held spot),
 * mark them expired, then roll each freed spot to the next person in line.
 */
export async function expireStaleOffers(): Promise<{
  expired: number;
  rolled: number;
}> {
  const svc = createServiceClient();
  const nowISO = new Date().toISOString();

  const { data: rows } = await svc
    .from("waitlist_entries")
    .select("*")
    .eq("status", "offered")
    .lt("offer_expires_at", nowISO);
  const stale = (rows ?? []) as WaitlistEntry[];

  const freedByKind = new Map<ServiceKind, Set<string>>();
  for (const e of stale) {
    if (e.offered_booking_id) {
      const { data: held } = await svc
        .from("bookings")
        .select("payment_status, status")
        .eq("id", e.offered_booking_id)
        .maybeSingle<{ payment_status: string; status: string }>();
      if (held?.payment_status === "paid") {
        // Claimed just in time but the webhook hadn't reconciled it — keep it.
        await svc
          .from("waitlist_entries")
          .update({ status: "claimed" })
          .eq("id", e.id);
        continue;
      }
      if (held && held.status !== "canceled") {
        await svc
          .from("bookings")
          .update({
            status: "canceled",
            canceled_at: nowISO,
            cancellation_reason: "Waitlist offer expired",
            waitlist_offer_expires_at: null,
          })
          .eq("id", e.offered_booking_id);
      }
      const set = freedByKind.get(e.service_kind) ?? new Set<string>();
      for (const d of enumerateDates(e.service_date, e.service_end_date)) {
        set.add(d);
      }
      freedByKind.set(e.service_kind, set);
    }
    await svc
      .from("waitlist_entries")
      .update({ status: "expired" })
      .eq("id", e.id);
  }

  let rolled = 0;
  for (const [kind, set] of freedByKind) {
    rolled += await processWaitlist(kind, Array.from(set));
  }
  return { expired: stale.length, rolled };
}

/**
 * Mark the waitlist entries behind these (now-paid) bookings claimed, and clear
 * the offer marker so they read as ordinary confirmed bookings. Called from the
 * Stripe webhook when an offer is paid.
 */
export async function markOffersClaimed(bookingIds: string[]): Promise<void> {
  if (bookingIds.length === 0) return;
  const svc = createServiceClient();
  await svc
    .from("waitlist_entries")
    .update({ status: "claimed" })
    .in("offered_booking_id", bookingIds)
    .eq("status", "offered");
  await svc
    .from("bookings")
    .update({ waitlist_offer_expires_at: null })
    .in("id", bookingIds)
    .not("waitlist_offer_expires_at", "is", null);
}

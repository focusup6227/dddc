import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  CustomerPackage,
  Dog,
  DogVaccination,
  Package,
  VaccineType,
  WaitlistEntry,
} from "@/lib/supabase/types";
import { joinWaitlist } from "../waitlist/actions";
import { addDays, formatMoney, todayISO } from "@/lib/format";
import { getFullDates } from "@/lib/settings";
import { getPastDueUnpaid } from "@/lib/bookings.server";
import { getEventsInRange } from "@/lib/events.server";
import { getBlackoutsInRange, expandBlackoutDates } from "@/lib/blackouts.server";
import { materializeForCustomer } from "@/lib/recurring.server";
import {
  missingForBooking,
  summarizeCoverage,
  VACCINE_LABEL,
} from "@/lib/vaccines";
import { BookForm } from "./BookForm";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; waitlisted?: string }>;
}) {
  const { userId } = await requireCustomer();
  const supabase = await createClient();
  const params = await searchParams;

  // Keep standing-schedule bookings materialized so the calendar reflects them.
  await materializeForCustomer(userId);

  // Gate: must have signed an active waiver and have at least one dog.
  const [waiverSigsRes, dogsRes, pkgsRes, dropInPkgRes] = await Promise.all([
    supabase
      .from("waiver_signatures")
      .select("waiver_id, waivers!inner(active)", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("waivers.active", true),
    supabase.from("dogs").select("*").eq("owner_id", userId).eq("active", true).order("name"),
    supabase
      .from("customer_packages")
      .select("*")
      .eq("customer_id", userId)
      .eq("payment_status", "paid")
      .gt("days_remaining", 0)
      .order("created_at"),
    supabase
      .from("packages")
      .select("*")
      .eq("active", true)
      .eq("days_included", 1)
      .order("price_cents")
      .limit(1)
      .maybeSingle<Package>(),
  ]);

  const waiverSigned = (waiverSigsRes.count ?? 0) > 0;
  const dogs = (dogsRes.data ?? []) as Dog[];
  const packages = (pkgsRes.data ?? []) as CustomerPackage[];
  const dropInPkg = dropInPkgRes.data ?? null;
  const daysRemaining = packages.reduce((s, p) => s + p.days_remaining, 0);

  if (!waiverSigned) {
    return (
      <Notice
        title="Please sign the waiver first"
        body="We need a signed liability waiver on file before we can take bookings."
        cta={{ href: "/waiver", label: "Sign waiver" }}
      />
    );
  }
  if (dogs.length === 0) {
    return (
      <Notice
        title="Add your dog first"
        body="Tell us about your dog so we can book them in."
        cta={{ href: "/dogs/new", label: "Add a dog" }}
      />
    );
  }

  const pastDue = await getPastDueUnpaid(userId);
  if (pastDue.length > 0) {
    return (
      <Notice
        title="You have an unpaid balance"
        body={`Please pay for ${pastDue.length} past booking${pastDue.length === 1 ? "" : "s"} before booking new dates.`}
        cta={{ href: "/bookings", label: "View bookings" }}
      />
    );
  }

  // Pre-fetch existing bookings for the next 60 days so the calendar can avoid dupes.
  const startDate = todayISO();
  const endDate = addDays(startDate, 60);
  const datesInRange: string[] = [];
  for (let i = 0; i <= 60; i++) datesInRange.push(addDays(startDate, i));

  // Vaccine coverage per dog (evaluated as of the last bookable day so dogs
  // whose records would expire mid-range are flagged early).
  const dogIds = dogs.map((d) => d.id);
  const { data: vaxRows } = dogIds.length
    ? await supabase
        .from("dog_vaccinations")
        .select("*")
        .in("dog_id", dogIds)
    : { data: [] as DogVaccination[] };
  const vaxByDog = new Map<string, DogVaccination[]>();
  for (const r of (vaxRows ?? []) as DogVaccination[]) {
    const arr = vaxByDog.get(r.dog_id) ?? [];
    arr.push(r);
    vaxByDog.set(r.dog_id, arr);
  }
  const vaccineBlocks: Record<string, VaccineType[]> = {};
  for (const d of dogs) {
    const cov = summarizeCoverage(vaxByDog.get(d.id) ?? [], endDate);
    const missing = missingForBooking(cov, endDate);
    if (missing.length > 0) vaccineBlocks[d.id] = missing;
  }
  const allDogsBlocked =
    dogs.length > 0 && dogs.every((d) => vaccineBlocks[d.id]?.length);

  const { data: waitlistData } = await supabase
    .from("waitlist_entries")
    .select("*")
    .eq("customer_id", userId)
    .in("status", ["pending", "notified"])
    .gte("service_date", startDate);
  const waitlistEntries = (waitlistData ?? []) as WaitlistEntry[];
  const waitlistDates = new Set(
    waitlistEntries
      .filter((e) => e.service_kind === "daycare")
      .map((e) => e.service_date),
  );

  const [{ data: daycareRows }, { data: boardingStays }, fullDatesSet] = await Promise.all([
    supabase
      .from("bookings")
      .select("dog_id, service_date")
      .eq("customer_id", userId)
      .eq("service_kind", "daycare")
      .gte("service_date", startDate)
      .lte("service_date", endDate)
      .neq("status", "canceled"),
    supabase
      .from("bookings")
      .select("dog_id, service_date, service_end_date")
      .eq("customer_id", userId)
      .eq("service_kind", "boarding")
      .lte("service_date", endDate)
      .gt("service_end_date", startDate)
      .neq("status", "canceled"),
    getFullDates(datesInRange, "daycare"),
  ]);
  const existingData: { dog_id: string; service_date: string }[] = [
    ...(daycareRows ?? []),
  ];
  for (const stay of boardingStays ?? []) {
    let cur = stay.service_date;
    while (cur < stay.service_end_date) {
      if (cur >= startDate && cur <= endDate) {
        existingData.push({ dog_id: stay.dog_id, service_date: cur });
      }
      cur = addDays(cur, 1);
    }
  }
  const fullDates = Array.from(fullDatesSet);

  // Events + blackouts overlapping the visible window (today → today+42,
  // matching the BookForm calendar's 6-week grid).
  const calendarEnd = addDays(startDate, 42);
  const [events, blackouts] = await Promise.all([
    getEventsInRange(startDate, calendarEnd),
    getBlackoutsInRange(startDate, calendarEnd),
  ]);
  const eventDates = new Set<string>();
  for (const ev of events) {
    let cur = ev.start_date > startDate ? ev.start_date : startDate;
    const end = ev.end_date < calendarEnd ? ev.end_date : calendarEnd;
    while (cur <= end) {
      eventDates.add(cur);
      cur = addDays(cur, 1);
    }
  }
  const blackoutDates = expandBlackoutDates(
    blackouts.filter((b) => b.blocks_daycare),
    startDate,
    calendarEnd,
  );
  const blackoutReasonByDate: Record<string, string> = {};
  for (const b of blackouts) {
    if (!b.blocks_daycare) continue;
    let cur = b.start_date > startDate ? b.start_date : startDate;
    const end = b.end_date < calendarEnd ? b.end_date : calendarEnd;
    while (cur <= end) {
      if (!blackoutReasonByDate[cur]) {
        blackoutReasonByDate[cur] = b.reason ?? "Closed";
      }
      cur = addDays(cur, 1);
    }
  }

  return (
    <div className="max-w-3xl animate-fade-up">
      <header>
        <h1 className="font-display text-3xl font-bold text-ink-900">Book</h1>
        <p className="mt-1 text-sm text-ink-500">
          Day care for the day, or boarding for overnight stays.
        </p>
      </header>

      <KindTabs current="daycare" />

      <section className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-600">
          {daysRemaining > 0
            ? `You have ${daysRemaining} package days available — they'll be used first.`
            : dropInPkg
              ? `Day-care drop-in is ${formatMoney(dropInPkg.price_cents)} per day.`
              : "No package days available."}
        </p>
        <Link
          href="/recurring"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          Set up a standing weekly schedule →
        </Link>
      </section>

      {params.waitlisted && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800 shadow-soft">
          You&apos;re on the waitlist — we&apos;ll ping you the moment a spot
          opens.{" "}
          <Link href="/waitlist" className="font-semibold underline">
            See your list →
          </Link>
        </div>
      )}

      {fullDates.length > 0 && dogs.length > 0 && (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-soft">
          <p className="text-sm font-semibold text-amber-900">
            Some days are full
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Join the waitlist — we&apos;ll notify you (push + email) the moment
            a slot opens.
          </p>
          <ul className="mt-3 space-y-2">
            {fullDates.slice(0, 6).map((date) => {
              const already = waitlistDates.has(date);
              return (
                <li
                  key={date}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/70 bg-white px-3 py-2"
                >
                  <span className="text-sm font-medium text-stone-900">
                    {date}
                  </span>
                  {already ? (
                    <span className="text-xs font-medium text-emerald-700">
                      ✓ On the list
                    </span>
                  ) : (
                    <form
                      action={joinWaitlist}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="service_date" value={date} />
                      <input type="hidden" name="service_kind" value="daycare" />
                      <input type="hidden" name="back" value="/book" />
                      <select
                        name="dog_id"
                        required
                        defaultValue={dogs[0]?.id}
                        className="input text-xs"
                      >
                        {dogs.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                      >
                        Join
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {params.status === "package_redeemed" && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800 shadow-soft">
          Booked! We&apos;ve set aside a package day.
        </div>
      )}
      {params.status === "success" && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800 shadow-soft">
          Payment received — your booking is confirmed.
        </div>
      )}
      {params.error && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-800 shadow-soft">
          {params.error}
        </div>
      )}

      {allDogsBlocked && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 shadow-soft">
          All your dogs are missing required vaccine records. Open a dog&apos;s
          profile to upload them — once we verify, you can book.
        </div>
      )}

      <BookForm
        dogs={dogs}
        daysRemaining={daysRemaining}
        dropInPriceCents={dropInPkg?.price_cents ?? null}
        existingBookings={existingData}
        startDate={startDate}
        fullDates={fullDates}
        vaccineBlocks={vaccineBlocks}
        vaccineLabels={VACCINE_LABEL}
        events={events}
        eventDates={Array.from(eventDates)}
        blackoutDates={Array.from(blackoutDates)}
        blackoutReasonByDate={blackoutReasonByDate}
      />
    </div>
  );
}

function Notice({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="card max-w-xl animate-fade-up">
      <h1 className="font-display text-xl font-bold text-ink-900">{title}</h1>
      <p className="mt-2 text-ink-700">{body}</p>
      <Link href={cta.href} className="btn-primary mt-4">
        {cta.label}
      </Link>
    </div>
  );
}

function KindTabs({ current }: { current: "daycare" | "boarding" }) {
  const base =
    "flex-1 rounded-lg px-4 py-2 text-center text-sm font-semibold transition-colors";
  const active = "bg-brand-600 text-white shadow-sm";
  const inactive = "bg-white text-stone-700 hover:bg-stone-50";
  return (
    <nav
      role="tablist"
      aria-label="Booking type"
      className="mt-6 flex gap-2 rounded-xl border border-stone-200 bg-stone-100 p-1"
    >
      <Link
        href="/book"
        role="tab"
        aria-selected={current === "daycare"}
        className={`${base} ${current === "daycare" ? active : inactive}`}
      >
        Day Care
      </Link>
      <Link
        href="/board"
        role="tab"
        aria-selected={current === "boarding"}
        className={`${base} ${current === "boarding" ? active : inactive}`}
      >
        Boarding
      </Link>
    </nav>
  );
}

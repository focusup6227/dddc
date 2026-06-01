import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  CustomerPackage,
  Dog,
  DogVaccination,
  Package,
  VaccineType,
} from "@/lib/supabase/types";
import { addDays, formatMoney, todayISO } from "@/lib/format";
import { DOG_WASH_PRICE_CENTS, getFullDates } from "@/lib/settings";
import { getPastDueUnpaid } from "@/lib/bookings.server";
import { getEventsInRange } from "@/lib/events.server";
import { getBlackoutsInRange, expandBlackoutDates } from "@/lib/blackouts.server";
import { materializeForCustomer } from "@/lib/recurring.server";
import {
  missingForBooking,
  summarizeCoverage,
  VACCINE_LABEL,
} from "@/lib/vaccines";
import { ToastNotifier } from "@/components/ToastNotifier";
import { WaitlistJoinForm } from "@/components/WaitlistJoinForm";
import { BookForm } from "./BookForm";

const TOASTS = [
  {
    param: "status",
    whenValue: "package_redeemed",
    message: "Booked! We've set aside a package day.",
  },
  {
    param: "status",
    whenValue: "success",
    message: "Payment received — your booking is confirmed.",
  },
  {
    param: "waitlisted",
    message: "You're on the waitlist — we'll email you if a spot opens.",
  },
  { param: "error", tone: "error" as const },
];

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
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
        <p className="text-sm text-ink-700">
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

      <ToastNotifier toasts={TOASTS} />

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
        dogWashPriceCents={DOG_WASH_PRICE_CENTS}
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

      <WaitlistJoinForm
        kind="daycare"
        dogs={dogs.map((d) => ({ id: d.id, name: d.name }))}
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
  const inactive = "bg-white text-ink-700 hover:bg-stone-50";
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

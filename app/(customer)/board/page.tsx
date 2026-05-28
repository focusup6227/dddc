import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Dog, DogVaccination, VaccineType } from "@/lib/supabase/types";
import { addDays, todayISO } from "@/lib/format";
import { getBoardingRateCents, getFullDates } from "@/lib/settings";
import { getPastDueUnpaid } from "@/lib/bookings.server";
import { getEventsInRange } from "@/lib/events.server";
import { getBlackoutsInRange, expandBlackoutDates } from "@/lib/blackouts.server";
import {
  missingForBooking,
  summarizeCoverage,
  VACCINE_LABEL,
} from "@/lib/vaccines";
import { BoardForm } from "./BoardForm";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { userId } = await requireCustomer();
  const supabase = await createClient();
  const params = await searchParams;

  const [waiverSigsRes, dogsRes, rateCents] = await Promise.all([
    supabase
      .from("waiver_signatures")
      .select("waiver_id, waivers!inner(active)", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("waivers.active", true),
    supabase.from("dogs").select("*").eq("owner_id", userId).eq("active", true).order("name"),
    getBoardingRateCents(),
  ]);

  const waiverSigned = (waiverSigsRes.count ?? 0) > 0;
  const dogs = (dogsRes.data ?? []) as Dog[];

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

  // Pre-fetch the next 60 nights of boarding occupancy so the form can warn
  // about full nights up front.
  const startDate = todayISO();
  const datesInRange: string[] = [];
  for (let i = 0; i <= 60; i++) datesInRange.push(addDays(startDate, i));
  const endDate = datesInRange[datesInRange.length - 1];
  const fullNights = Array.from(await getFullDates(datesInRange, "boarding"));
  const [events, blackouts] = await Promise.all([
    getEventsInRange(startDate, endDate),
    getBlackoutsInRange(startDate, endDate),
  ]);
  const blackoutNights = Array.from(
    expandBlackoutDates(
      blackouts.filter((b) => b.blocks_boarding),
      startDate,
      endDate,
    ),
  );

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

  return (
    <div className="max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">Book</h1>
        <p className="text-stone-600">Day care for the day, or boarding for overnight stays.</p>
      </header>

      <KindTabs current="boarding" />

      <section className="mt-2">
        <p className="text-sm text-stone-600">
          Overnight stays for your dog. ${(rateCents / 100).toFixed(2)} per night.
        </p>
      </section>

      {params.status === "success" && (
        <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Payment received — boarding is confirmed.
        </div>
      )}
      {params.error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {params.error}
        </div>
      )}

      <BoardForm
        dogs={dogs}
        rateCents={rateCents}
        startDate={startDate}
        fullNights={fullNights}
        vaccineBlocks={vaccineBlocks}
        vaccineLabels={VACCINE_LABEL}
        events={events}
        blackoutNights={blackoutNights}
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
    <div className="card max-w-xl">
      <h1 className="text-xl font-bold text-stone-900">{title}</h1>
      <p className="mt-2 text-stone-700">{body}</p>
      <Link href={cta.href} className="btn-primary mt-4 inline-block">
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

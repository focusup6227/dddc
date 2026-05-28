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
import { getFullDates } from "@/lib/settings";
import { getPastDueUnpaid } from "@/lib/bookings.server";
import {
  missingForBooking,
  summarizeCoverage,
  VACCINE_LABEL,
} from "@/lib/vaccines";
import { BookForm } from "./BookForm";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { userId } = await requireCustomer();
  const supabase = await createClient();
  const params = await searchParams;

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

  return (
    <div className="max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">Book a day</h1>
        <p className="text-stone-600">
          {daysRemaining > 0
            ? `You have ${daysRemaining} package days available — they'll be used first.`
            : dropInPkg
              ? `No package days available. Drop-in days are ${formatMoney(dropInPkg.price_cents)} each.`
              : "No package days available."}
        </p>
      </header>

      {params.status === "package_redeemed" && (
        <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Booked! We&apos;ve set aside a package day.
        </div>
      )}
      {params.status === "success" && (
        <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Payment received — your booking is confirmed.
        </div>
      )}
      {params.error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {params.error}
        </div>
      )}

      {allDogsBlocked && (
        <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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

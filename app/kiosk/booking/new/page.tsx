import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayISO } from "@/lib/format";
import { getFullDates } from "@/lib/settings";
import type { CustomerPackage, Dog, Package, Profile } from "@/lib/supabase/types";
import { KioskBookForm } from "./KioskBookForm";

export const dynamic = "force-dynamic";

export default async function KioskNewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; customer?: string; error?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const selectedCustomerId = params.customer ?? null;

  const supabase = await createClient();

  // Drop-in price
  const { data: dropInPkg } = await supabase
    .from("packages")
    .select("*")
    .eq("active", true)
    .eq("days_included", 1)
    .order("price_cents")
    .limit(1)
    .maybeSingle<Package>();

  // Search matches
  let matches: Profile[] = [];
  if (q.length >= 2 && !selectedCustomerId) {
    const term = `%${q}%`;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "customer")
      .or(`full_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`)
      .order("full_name")
      .limit(25);
    matches = (data ?? []) as Profile[];
  }

  // Selected customer
  let customer: Profile | null = null;
  let dogs: Dog[] = [];
  let packages: CustomerPackage[] = [];
  let existing: { dog_id: string; service_date: string }[] = [];
  const fullDates: string[] = [];
  let waiverSigned = false;

  if (selectedCustomerId) {
    const startDate = todayISO();
    const endDate = addDays(startDate, 60);
    const datesInRange: string[] = [];
    for (let i = 0; i <= 60; i++) datesInRange.push(addDays(startDate, i));
    const [
      { data: cust },
      { data: dogRows },
      { data: pkgRows },
      { data: daycareBookings },
      { data: boardingStays },
      fullDatesSet,
      { count: waiverCount },
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", selectedCustomerId).maybeSingle<Profile>(),
      supabase
        .from("dogs")
        .select("*")
        .eq("owner_id", selectedCustomerId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("customer_packages")
        .select("*")
        .eq("customer_id", selectedCustomerId)
        .eq("payment_status", "paid")
        .gt("days_remaining", 0)
        .order("created_at"),
      supabase
        .from("bookings")
        .select("dog_id, service_date")
        .eq("customer_id", selectedCustomerId)
        .eq("service_kind", "daycare")
        .gte("service_date", startDate)
        .lte("service_date", endDate)
        .neq("status", "canceled"),
      supabase
        .from("bookings")
        .select("dog_id, service_date, service_end_date")
        .eq("customer_id", selectedCustomerId)
        .eq("service_kind", "boarding")
        .lte("service_date", endDate)
        .gt("service_end_date", startDate)
        .neq("status", "canceled"),
      getFullDates(datesInRange, "daycare"),
      supabase
        .from("waiver_signatures")
        .select("waiver_id, waivers!inner(active)", { count: "exact", head: true })
        .eq("user_id", selectedCustomerId)
        .eq("waivers.active", true),
    ]);
    customer = cust ?? null;
    dogs = (dogRows ?? []) as Dog[];
    packages = (pkgRows ?? []) as CustomerPackage[];
    waiverSigned = (waiverCount ?? 0) > 0;

    const expanded: { dog_id: string; service_date: string }[] = [
      ...(daycareBookings ?? []),
    ];
    for (const stay of boardingStays ?? []) {
      let cur = stay.service_date;
      while (cur < stay.service_end_date) {
        if (cur >= startDate && cur <= endDate) {
          expanded.push({ dog_id: stay.dog_id, service_date: cur });
        }
        cur = addDays(cur, 1);
      }
    }
    existing = expanded;
    fullDates.push(...fullDatesSet);
  }

  const daysRemaining = packages.reduce((s, p) => s + p.days_remaining, 0);

  return (
    <div className="space-y-6">
      <Link href="/kiosk" className="text-sm font-medium text-stone-600 hover:text-stone-900">
        ← Back to today
      </Link>

      <h1 className="text-3xl font-bold">New booking</h1>

      {selectedCustomerId && (
        <KindTabs current="daycare" customerId={selectedCustomerId} />
      )}

      {params.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {params.error}
        </div>
      )}

      {!selectedCustomerId ? (
        <>
          <form className="flex gap-2" action="/kiosk/booking/new" method="get">
            <input
              type="text"
              name="q"
              defaultValue={q}
              autoFocus
              placeholder="Search by name, email, or phone"
              className="input w-full text-lg"
              inputMode="search"
            />
            <button type="submit" className="btn-primary shrink-0 px-5 text-base">
              Search
            </button>
          </form>

          {q.length >= 2 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
                {matches.length} result{matches.length === 1 ? "" : "s"}
              </h2>
              {matches.length === 0 ? (
                <p className="text-stone-600">
                  No customers found.
                </p>
              ) : (
                <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
                  {matches.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/kiosk/booking/new?customer=${m.id}`}
                        className="flex items-center justify-between p-4 hover:bg-stone-50"
                      >
                        <div>
                          <p className="font-semibold text-stone-900">
                            {m.full_name || m.email}
                          </p>
                          <p className="text-sm text-stone-500">
                            {m.email}
                            {m.phone && ` · ${m.phone}`}
                          </p>
                        </div>
                        <span className="text-sm font-medium text-brand-700">Select →</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {q.length < 2 && (
            <p className="text-sm text-stone-500">
              Type at least 2 characters to search.
            </p>
          )}
        </>
      ) : !customer ? (
        <p className="text-stone-600">Customer not found.</p>
      ) : dogs.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This customer has no active dogs. They need to add a dog at /dogs before booking.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Customer
              </p>
              <p className="text-lg font-bold text-stone-900">
                {customer.full_name || customer.email}
              </p>
              <p className="text-sm text-stone-500">
                {customer.email}
                {customer.phone && ` · ${customer.phone}`}
                {" · "}
                <span className="text-stone-700">
                  {daysRemaining} package day{daysRemaining === 1 ? "" : "s"}
                </span>
              </p>
            </div>
            <Link href="/kiosk/booking/new" className="btn-secondary">
              Change
            </Link>
          </div>

          {!waiverSigned && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Customer hasn&apos;t signed the active waiver. They need to sign at
              /waiver on their own device before this booking is valid.
            </div>
          )}

          <KioskBookForm
            customerId={customer.id}
            dogs={dogs}
            daysRemaining={daysRemaining}
            dropInPriceCents={dropInPkg?.price_cents ?? null}
            existingBookings={existing}
            fullDates={fullDates}
            startDate={todayISO()}
          />
        </>
      )}
    </div>
  );
}

function KindTabs({
  current,
  customerId,
}: {
  current: "daycare" | "boarding";
  customerId: string;
}) {
  const base =
    "flex-1 rounded-lg px-4 py-2 text-center text-base font-semibold transition-colors";
  const active = "bg-brand-600 text-white shadow-sm";
  const inactive = "bg-white text-stone-700 hover:bg-stone-50";
  return (
    <nav
      role="tablist"
      aria-label="Booking type"
      className="flex gap-2 rounded-xl border border-stone-200 bg-stone-100 p-1"
    >
      <Link
        href={`/kiosk/booking/new?customer=${customerId}`}
        role="tab"
        aria-selected={current === "daycare"}
        className={`${base} ${current === "daycare" ? active : inactive}`}
      >
        Day Care
      </Link>
      <Link
        href={`/kiosk/boarding/new?customer=${customerId}`}
        role="tab"
        aria-selected={current === "boarding"}
        className={`${base} ${current === "boarding" ? active : inactive}`}
      >
        Boarding
      </Link>
    </nav>
  );
}

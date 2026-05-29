import Link from "next/link";
import { requireFullStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayISO } from "@/lib/format";
import { getBoardingRateCents, getFullDates } from "@/lib/settings";
import type { Dog, Profile } from "@/lib/supabase/types";
import { ToastNotifier } from "@/components/ToastNotifier";
import { KioskBoardForm } from "./KioskBoardForm";

const ERROR_TOAST = [{ param: "error", tone: "error" as const }];

export const dynamic = "force-dynamic";

export default async function KioskNewBoardingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; customer?: string; error?: string }>;
}) {
  await requireFullStaff();
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const selectedCustomerId = params.customer ?? null;

  const supabase = await createClient();

  // Search matches.
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

  let customer: Profile | null = null;
  let dogs: Dog[] = [];
  let waiverSigned = false;
  let fullNights: string[] = [];
  const rateCents = await getBoardingRateCents();

  if (selectedCustomerId) {
    const startDate = todayISO();
    const datesInRange: string[] = [];
    for (let i = 0; i <= 60; i++) datesInRange.push(addDays(startDate, i));
    const [
      { data: cust },
      { data: dogRows },
      fullNightsSet,
      { count: waiverCount },
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", selectedCustomerId).maybeSingle<Profile>(),
      supabase
        .from("dogs")
        .select("*")
        .eq("owner_id", selectedCustomerId)
        .eq("active", true)
        .order("name"),
      getFullDates(datesInRange, "boarding"),
      supabase
        .from("waiver_signatures")
        .select("waiver_id, waivers!inner(active)", { count: "exact", head: true })
        .eq("user_id", selectedCustomerId)
        .eq("waivers.active", true),
    ]);
    customer = cust ?? null;
    dogs = (dogRows ?? []) as Dog[];
    waiverSigned = (waiverCount ?? 0) > 0;
    fullNights = Array.from(fullNightsSet);
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <Link
        href="/kiosk"
        className="text-sm font-medium text-ink-700 hover:text-ink-900 hover:underline"
      >
        ← Back to today
      </Link>

      <h1 className="font-display text-4xl font-bold text-ink-900">
        New booking
      </h1>

      {selectedCustomerId && (
        <KindTabs current="boarding" customerId={selectedCustomerId} />
      )}

      <ToastNotifier toasts={ERROR_TOAST} />

      {!selectedCustomerId ? (
        <>
          <form className="flex gap-2" action="/kiosk/boarding/new" method="get">
            <input
              type="text"
              name="q"
              defaultValue={q}
              autoFocus
              placeholder="Search by name, email, or phone"
              className="input w-full text-lg"
              inputMode="search"
            />
            <button
              type="submit"
              className="btn-primary shrink-0 px-5 text-base"
            >
              Search
            </button>
          </form>

          {q.length >= 2 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                {matches.length} result{matches.length === 1 ? "" : "s"}
              </h2>
              {matches.length === 0 ? (
                <p className="text-ink-500">No customers found.</p>
              ) : (
                <ul className="divide-y divide-stone-200/80 rounded-2xl border border-stone-200/80 bg-white shadow-soft">
                  {matches.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/kiosk/boarding/new?customer=${m.id}`}
                        className="flex items-center justify-between p-4 transition-colors hover:bg-cream-50"
                      >
                        <div>
                          <p className="font-semibold text-ink-900">
                            {m.full_name || m.email}
                          </p>
                          <p className="text-sm text-ink-500">
                            {m.email}
                            {m.phone && ` · ${m.phone}`}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-brand-700">
                          Select →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {q.length < 2 && (
            <p className="text-sm text-ink-500">
              Type at least 2 characters to search.
            </p>
          )}
        </>
      ) : !customer ? (
        <p className="text-ink-500">Customer not found.</p>
      ) : dogs.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 shadow-soft">
          This customer has no active dogs. Add a dog first.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-3xl border border-stone-200/80 bg-white p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Customer
              </p>
              <p className="mt-1 font-display text-xl font-bold text-ink-900">
                {customer.full_name || customer.email}
              </p>
              <p className="text-sm text-ink-500">
                {customer.email}
                {customer.phone && ` · ${customer.phone}`}
              </p>
            </div>
            <Link href="/kiosk/boarding/new" className="btn-secondary shrink-0">
              Change
            </Link>
          </div>

          {!waiverSigned && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 shadow-soft">
              Customer hasn&apos;t signed the active waiver. They need to sign
              at /waiver on their own device before this booking is valid.
            </div>
          )}

          <KioskBoardForm
            customerId={customer.id}
            dogs={dogs}
            rateCents={rateCents}
            startDate={todayISO()}
            fullNights={fullNights}
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
    "flex-1 rounded-xl px-4 py-2 text-center text-base font-semibold transition-all";
  const active = "bg-ink-900 text-white shadow-soft";
  const inactive = "text-ink-700 hover:bg-cream-100 hover:text-ink-900";
  return (
    <nav
      role="tablist"
      aria-label="Booking type"
      className="flex gap-1 rounded-2xl border border-stone-200/80 bg-white p-1 shadow-soft"
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

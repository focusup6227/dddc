import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DogAvatar } from "@/components/DogAvatar";
import { formatMoney } from "@/lib/format";
import type { Dog, Package, Profile, WaiverSignature } from "@/lib/supabase/types";
import { kioskWalkInCharge } from "../actions";

export const dynamic = "force-dynamic";

export default async function WalkInPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; customer?: string; error?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const selectedCustomerId = params.customer ?? null;

  const supabase = await createClient();

  // Drop-in rate
  const { data: dropInPkg } = await supabase
    .from("packages")
    .select("*")
    .eq("active", true)
    .eq("days_included", 1)
    .order("price_cents")
    .limit(1)
    .maybeSingle<Package>();

  // Search results
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

  // Selected customer + their dogs + waiver state
  let customer: Profile | null = null;
  let dogs: Dog[] = [];
  let waiverSigned = false;
  if (selectedCustomerId) {
    const { data: cust } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", selectedCustomerId)
      .maybeSingle<Profile>();
    customer = cust ?? null;
    if (customer) {
      const [{ data: dogRows }, { count }] = await Promise.all([
        supabase
          .from("dogs")
          .select("*")
          .eq("owner_id", customer.id)
          .eq("active", true)
          .order("name"),
        supabase
          .from("waiver_signatures")
          .select("waiver_id, waivers!inner(active)", { count: "exact", head: true })
          .eq("user_id", customer.id)
          .eq("waivers.active", true),
      ]);
      dogs = (dogRows ?? []) as Dog[];
      waiverSigned = (count ?? 0) > 0;
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/kiosk" className="text-sm font-medium text-stone-600 hover:text-stone-900">
        ← Back to today
      </Link>

      <h1 className="text-3xl font-bold">New walk-in</h1>

      {params.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {params.error}
        </div>
      )}

      {!selectedCustomerId ? (
        <>
          <form className="flex gap-2" action="/kiosk/walk-in" method="get">
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
                  No customers found. They&apos;ll need to sign up at the regular
                  /signup flow and sign the waiver before booking here.
                </p>
              ) : (
                <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
                  {matches.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/kiosk/walk-in?customer=${m.id}`}
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
      ) : (
        <CustomerStep
          customer={customer}
          dogs={dogs}
          waiverSigned={waiverSigned}
          dropInPriceCents={dropInPkg?.price_cents ?? null}
        />
      )}
    </div>
  );
}

function CustomerStep({
  customer,
  dogs,
  waiverSigned,
  dropInPriceCents,
}: {
  customer: Profile;
  dogs: Dog[];
  waiverSigned: boolean;
  dropInPriceCents: number | null;
}) {
  return (
    <div className="space-y-6">
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
          </p>
        </div>
        <Link href="/kiosk/walk-in" className="btn-secondary">
          Change
        </Link>
      </div>

      {!waiverSigned && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This customer hasn&apos;t signed the active waiver. They need to sign at
          /waiver on their own device before you can charge a walk-in.
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Pick a dog · {dropInPriceCents ? formatMoney(dropInPriceCents) : "—"} drop-in
        </h2>
        {dogs.length === 0 ? (
          <p className="text-stone-600">No active dogs on this account.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {dogs.map((d) => (
              <form key={d.id} action={kioskWalkInCharge}>
                <input type="hidden" name="customer_id" value={customer.id} />
                <input type="hidden" name="dog_id" value={d.id} />
                <button
                  type="submit"
                  disabled={!waiverSigned || !dropInPriceCents}
                  className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left transition-colors hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50 disabled:hover:bg-white"
                >
                  <DogAvatar photoPath={d.photo_path} name={d.name} size={64} />
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold text-stone-900">{d.name}</p>
                    {d.breed && (
                      <p className="truncate text-sm text-stone-500">{d.breed}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white">
                    Charge {dropInPriceCents ? formatMoney(dropInPriceCents) : ""}
                  </span>
                </button>
              </form>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

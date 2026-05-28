import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Coupon } from "@/lib/supabase/types";
import { formatDate, formatMoney } from "@/lib/format";
import { StaffSubNav } from "@/components/StaffSubNav";
import { createCoupon, deleteCoupon, toggleCoupon } from "./actions";

const SUBNAV = [
  { href: "/staff/settings", label: "General" },
  { href: "/staff/packages", label: "Packages" },
  { href: "/staff/coupons", label: "Coupons", active: true },
  { href: "/staff/events", label: "Events" },
];

export const dynamic = "force-dynamic";

export default async function StaffCouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("coupons")
    .select("*")
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });
  const coupons = (data ?? []) as Coupon[];

  return (
    <div className="space-y-6">
      <StaffSubNav items={SUBNAV} />
      <header>
        <h1 className="text-2xl font-bold text-stone-900">Coupons</h1>
        <p className="text-stone-600">
          Fixed dollar-off-per-day codes. Customers enter the code when paying
          a booking; we automatically pick the bigger of the coupon and any
          account credit.
        </p>
      </header>

      {params.saved && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
          Saved.
        </p>
      )}
      {params.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
          {params.error}
        </p>
      )}

      <section className="card">
        <h2 className="font-semibold text-stone-900">Add a coupon</h2>
        <form action={createCoupon} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="code" className="label">Code</label>
            <input
              id="code"
              name="code"
              required
              placeholder="e.g. SUMMER25"
              className="input uppercase"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div>
            <label htmlFor="discount_per_day" className="label">$ off per day</label>
            <input
              id="discount_per_day"
              name="discount_per_day"
              required
              type="number"
              step="0.01"
              min="0.01"
              placeholder="5.00"
              className="input"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="description" className="label">Description (optional)</label>
            <input
              id="description"
              name="description"
              placeholder="Friends and family"
              className="input"
            />
          </div>
          <div>
            <label htmlFor="expires_on" className="label">Expires on (optional)</label>
            <input
              id="expires_on"
              name="expires_on"
              type="date"
              className="input"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" className="btn-primary">Create coupon</button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-stone-900">All coupons</h2>
        {coupons.length === 0 ? (
          <p className="mt-2 text-stone-600">No coupons yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
            {coupons.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-stone-900">
                    <code className="font-mono">{c.code}</code>{" "}
                    <span className="font-normal text-stone-500">
                      · {formatMoney(c.discount_per_day_cents)}/day off
                    </span>
                  </p>
                  {c.description && (
                    <p className="text-sm text-stone-600">{c.description}</p>
                  )}
                  <p className="text-xs text-stone-500">
                    Added {formatDate(c.created_at)}
                    {c.expires_on ? ` · expires ${c.expires_on}` : ""}
                    {!c.active ? " · disabled" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <form action={toggleCoupon}>
                    <input type="hidden" name="id" value={c.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
                    >
                      {c.active ? "Disable" : "Enable"}
                    </button>
                  </form>
                  <form action={deleteCoupon}>
                    <input type="hidden" name="id" value={c.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

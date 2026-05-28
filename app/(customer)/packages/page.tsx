import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CustomerPackage, Package } from "@/lib/supabase/types";
import { formatDate, formatMoney } from "@/lib/format";
import { buyPackage } from "./actions";

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { userId } = await requireCustomer();
  const supabase = await createClient();
  const params = await searchParams;

  const [pkgsRes, ownedRes] = await Promise.all([
    supabase.from("packages").select("*").eq("active", true).order("sort_order"),
    supabase
      .from("customer_packages")
      .select("*")
      .eq("customer_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  const packages = (pkgsRes.data ?? []) as Package[];
  const owned = (ownedRes.data ?? []) as CustomerPackage[];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">Packages</h1>
        <p className="text-stone-600">
          Save money by buying day packs in advance.
        </p>
      </header>

      {params.status === "success" && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Thanks! Your purchase is being processed. Your days will appear here once Stripe confirms the payment.
        </div>
      )}
      {params.status === "canceled" && (
        <div className="rounded-md border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800">
          Checkout canceled. No charge was made.
        </div>
      )}
      {params.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {params.error}
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold text-stone-900">Available packages</h2>
        <ul className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {packages.map((p) => {
            const perDay = Math.round(p.price_cents / p.days_included);
            return (
              <li key={p.id} className="card flex flex-col">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-stone-900">{p.name}</h3>
                  <p className="mt-1 text-sm text-stone-600">{p.description}</p>
                  <p className="mt-3 text-2xl font-bold text-stone-900">
                    {formatMoney(p.price_cents)}
                  </p>
                  <p className="text-xs text-stone-500">
                    {p.days_included} {p.days_included === 1 ? "day" : "days"} ·{" "}
                    {formatMoney(perDay)} / day
                  </p>
                </div>
                <form action={buyPackage} className="mt-4">
                  <input type="hidden" name="package_id" value={p.id} />
                  <button type="submit" className="btn-primary w-full">
                    Buy
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-stone-900">Your purchases</h2>
        {owned.length === 0 ? (
          <p className="mt-2 text-stone-600">No purchases yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
            {owned.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-stone-900">
                    {p.days_remaining} / {p.days_total} days remaining
                  </p>
                  <p className="text-sm text-stone-500">
                    {formatDate(p.created_at)} · {formatMoney(p.amount_paid_cents)} · {p.payment_status}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

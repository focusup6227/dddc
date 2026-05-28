import { Ticket } from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CustomerPackage, Package } from "@/lib/supabase/types";
import { formatDate, formatMoney } from "@/lib/format";
import { ToastNotifier } from "@/components/ToastNotifier";
import { buyPackage } from "./actions";

const TOASTS = [
  {
    param: "status",
    whenValue: "success",
    message:
      "Thanks! Your purchase is being processed. Your days will appear here once Stripe confirms the payment.",
  },
  {
    param: "status",
    whenValue: "canceled",
    tone: "info" as const,
    message: "Checkout canceled. No charge was made.",
  },
  { param: "error", tone: "error" as const },
];

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
    <div className="space-y-8 animate-fade-up">
      <header>
        <h1 className="font-display text-3xl font-bold text-ink-900">
          Packages
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Save money by buying day packs in advance.
        </p>
      </header>

      <ToastNotifier toasts={TOASTS} />

      <section>
        <h2 className="font-display text-xl font-semibold text-ink-900">
          Available packages
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {packages.map((p) => {
            const perDay = Math.round(p.price_cents / p.days_included);
            return (
              <li key={p.id} className="card-lift flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="font-display text-lg font-semibold text-ink-900">
                      {p.name}
                    </h3>
                    {p.description && (
                      <p className="mt-1 text-sm text-ink-500">{p.description}</p>
                    )}
                  </div>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <Ticket size={18} />
                  </span>
                </div>
                <p className="mt-4 font-display text-3xl font-bold text-ink-900">
                  {formatMoney(p.price_cents)}
                </p>
                <p className="text-xs text-ink-500">
                  {p.days_included} {p.days_included === 1 ? "day" : "days"} ·{" "}
                  {formatMoney(perDay)} / day
                </p>
                <form action={buyPackage} className="mt-5">
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
        <h2 className="font-display text-xl font-semibold text-ink-900">
          Your purchases
        </h2>
        {owned.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">No purchases yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-stone-200/80 rounded-2xl border border-stone-200/80 bg-white shadow-soft">
            {owned.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between px-5 py-4"
              >
                <div>
                  <p className="font-semibold text-ink-900">
                    {p.days_remaining} / {p.days_total} days remaining
                  </p>
                  <p className="text-sm text-ink-500">
                    {formatDate(p.created_at)} ·{" "}
                    {formatMoney(p.amount_paid_cents)} ·{" "}
                    <span
                      className={
                        p.payment_status === "paid"
                          ? "text-emerald-700 font-medium"
                          : ""
                      }
                    >
                      {p.payment_status}
                    </span>
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

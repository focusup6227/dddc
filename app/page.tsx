import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format";
import type { Package } from "@/lib/supabase/types";

const BOARDING_RATE_CENTS = 3000;

export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("packages")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  const packages = (data ?? []) as Package[];

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="text-center">
        <Image
          src="/logo.jpg"
          alt="Dixon Doggy Day Care and Boarding"
          width={240}
          height={240}
          priority
          className="mx-auto h-44 w-44 rounded-full shadow-md sm:h-56 sm:w-56"
        />
        <p className="mt-6 text-sm font-semibold uppercase tracking-wider text-brand-600">
          Dixon Doggy Day Care and Boarding
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl">
          A second home for your best friend.
        </h1>
        <p className="mt-4 text-lg text-stone-600">
          Day care, boarding, and a whole lot of belly rubs.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup" className="btn-primary">
            Create an account
          </Link>
          <Link href="/login" className="btn-secondary">
            Sign in
          </Link>
        </div>
      </div>

      <section className="mt-20">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-stone-900">Pricing</h2>
          <p className="mt-2 text-stone-600">
            Simple, per-dog rates. Save with prepaid daycare packs.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="card">
            <h3 className="text-lg font-semibold text-stone-900">Day Care</h3>
            <p className="text-sm text-stone-600">Drop-off and pickup, group play all day.</p>
            <ul className="mt-4 divide-y divide-stone-200">
              {packages.map((p) => {
                const perDay = Math.round(p.price_cents / p.days_included);
                const isDropIn = p.days_included === 1;
                return (
                  <li key={p.id} className="flex items-baseline justify-between py-3">
                    <div>
                      <p className="font-medium text-stone-900">{p.name}</p>
                      <p className="text-xs text-stone-500">
                        {isDropIn
                          ? "Pay-as-you-go"
                          : `${p.days_included} days · ${formatMoney(perDay)} / day`}
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-stone-900">
                      {formatMoney(p.price_cents)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-stone-900">Boarding</h3>
            <p className="text-sm text-stone-600">
              Overnight stays in our home. Includes day care during the stay.
            </p>
            <ul className="mt-4 divide-y divide-stone-200">
              <li className="flex items-baseline justify-between py-3">
                <div>
                  <p className="font-medium text-stone-900">Per night</p>
                  <p className="text-xs text-stone-500">Per dog</p>
                </div>
                <p className="text-lg font-semibold text-stone-900">
                  {formatMoney(BOARDING_RATE_CENTS)}
                </p>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <p className="mt-16 text-center text-sm text-stone-500">
        Staff member?{" "}
        <Link href="/staff/login" className="font-medium text-brand-600 hover:text-brand-700">
          Sign in to the operator dashboard
        </Link>
        .
      </p>
    </main>
  );
}

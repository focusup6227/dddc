import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateShort, todayISO } from "@/lib/format";
import type { Booking, CustomerPackage, Dog } from "@/lib/supabase/types";

export default async function CustomerDashboard() {
  const { userId, profile } = await requireCustomer();
  const supabase = await createClient();

  const [dogsRes, bookingsRes, packagesRes] = await Promise.all([
    supabase
      .from("dogs")
      .select("*")
      .eq("owner_id", userId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("bookings")
      .select("*")
      .eq("customer_id", userId)
      .gte("service_date", todayISO())
      .neq("status", "canceled")
      .order("service_date")
      .limit(5),
    supabase
      .from("customer_packages")
      .select("*")
      .eq("customer_id", userId)
      .eq("payment_status", "paid")
      .gt("days_remaining", 0)
      .order("created_at", { ascending: false }),
  ]);

  const dogs = (dogsRes.data ?? []) as Dog[];
  const bookings = (bookingsRes.data ?? []) as Booking[];
  const packages = (packagesRes.data ?? []) as CustomerPackage[];
  const totalDays = packages.reduce((s, p) => s + p.days_remaining, 0);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">
          Hi {profile.full_name?.split(" ")[0] || "there"} 👋
        </h1>
        <p className="text-stone-600">Here&apos;s what&apos;s happening.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          title="Dogs"
          value={String(dogs.length)}
          cta={dogs.length ? { href: "/dogs", label: "Manage" } : { href: "/dogs/new", label: "Add a dog" }}
        />
        <StatCard
          title="Days remaining"
          value={String(totalDays)}
          cta={{ href: "/packages", label: totalDays ? "Buy more" : "Buy a package" }}
        />
        <StatCard
          title="Upcoming bookings"
          value={String(bookings.length)}
          cta={{ href: "/book", label: "Book a day" }}
        />
      </div>

      <section className="card">
        <h2 className="text-lg font-semibold text-stone-900">Upcoming bookings</h2>
        {bookings.length === 0 ? (
          <p className="mt-2 text-stone-600">No upcoming bookings yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-stone-200">
            {bookings.map((b) => {
              const dog = dogs.find((d) => d.id === b.dog_id);
              return (
                <li key={b.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-stone-900">
                      {formatDateShort(b.service_date)} — {dog?.name ?? "Dog"}
                    </p>
                    <p className="text-sm text-stone-500">
                      {b.payment_kind === "package" ? "Package day" : "Drop-in"} · {b.status}
                    </p>
                  </div>
                  <Link href="/bookings" className="text-sm font-medium text-brand-700 hover:underline">
                    Details
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({
  title,
  value,
  cta,
}: {
  title: string;
  value: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="card">
      <p className="text-sm font-medium text-stone-500">{title}</p>
      <p className="mt-2 text-3xl font-bold text-stone-900">{value}</p>
      <Link href={cta.href} className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">
        {cta.label} →
      </Link>
    </div>
  );
}

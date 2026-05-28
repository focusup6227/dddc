import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Booking,
  CustomerPackage,
  Dog,
  Profile,
  WaiverSignature,
} from "@/lib/supabase/types";
import { DogAvatar } from "@/components/DogAvatar";
import { formatDate, formatDateShort, formatMoney } from "@/lib/format";

export default async function StaffCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle<Profile>();
  if (!customer) notFound();

  const [dogsRes, bookingsRes, pkgsRes, sigsRes] = await Promise.all([
    supabase.from("dogs").select("*").eq("owner_id", id).order("name"),
    supabase
      .from("bookings")
      .select("*")
      .eq("customer_id", id)
      .order("service_date", { ascending: false })
      .limit(30),
    supabase
      .from("customer_packages")
      .select("*")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("waiver_signatures")
      .select("*")
      .eq("user_id", id)
      .order("signed_at", { ascending: false }),
  ]);

  const dogs = (dogsRes.data ?? []) as Dog[];
  const bookings = (bookingsRes.data ?? []) as Booking[];
  const packages = (pkgsRes.data ?? []) as CustomerPackage[];
  const sigs = (sigsRes.data ?? []) as WaiverSignature[];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">{customer.full_name || "(no name)"}</h1>
        <p className="text-stone-600">
          {customer.email}
          {customer.phone ? ` · ${customer.phone}` : ""}
        </p>
        {customer.emergency_contact_name && (
          <p className="text-sm text-stone-500">
            Emergency: {customer.emergency_contact_name}{" "}
            {customer.emergency_contact_phone ? `(${customer.emergency_contact_phone})` : ""}
          </p>
        )}
      </header>

      <section>
        <h2 className="text-lg font-semibold text-stone-900">Dogs</h2>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {dogs.map((d) => (
            <li key={d.id}>
              <Link href={`/staff/dogs/${d.id}`} className="card flex items-center gap-4 hover:shadow-md transition-shadow">
                <DogAvatar photoPath={d.photo_path} name={d.name} />
                <div>
                  <p className="font-semibold text-stone-900">{d.name}</p>
                  <p className="text-sm text-stone-500">{d.breed ?? "Mixed breed"}</p>
                </div>
              </Link>
            </li>
          ))}
          {dogs.length === 0 && <li className="text-stone-600">No dogs on file.</li>}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-stone-900">Waiver</h2>
        {sigs.length === 0 ? (
          <p className="mt-2 text-red-600">No waiver on file.</p>
        ) : (
          <ul className="mt-2 text-sm text-stone-700">
            {sigs.map((s) => (
              <li key={s.id}>
                Signed by <strong>{s.signed_full_name}</strong> on {formatDate(s.signed_at)}
                {s.ip_address ? ` (${s.ip_address})` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-stone-900">Packages</h2>
        {packages.length === 0 ? (
          <p className="mt-2 text-stone-600">No purchases.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
            {packages.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-stone-900">
                    {p.days_remaining} / {p.days_total} days remaining
                  </p>
                  <p className="text-stone-500">
                    {formatDate(p.created_at)} · {formatMoney(p.amount_paid_cents)} · {p.payment_status}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-stone-900">Recent bookings</h2>
        {bookings.length === 0 ? (
          <p className="mt-2 text-stone-600">None.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
            {bookings.map((b) => {
              const dog = dogs.find((d) => d.id === b.dog_id);
              return (
                <li key={b.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>
                    {formatDateShort(b.service_date)} — {dog?.name ?? "Dog"}
                  </span>
                  <span className="text-stone-500">
                    {b.payment_kind} · {b.status} · {b.payment_status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

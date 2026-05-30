import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFullStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Booking,
  CustomerPackage,
  Dog,
  Profile,
  WaiverSignature,
} from "@/lib/supabase/types";
import { PlusCircle, CalendarPlus, Mail } from "lucide-react";
import { DogAvatar } from "@/components/DogAvatar";
import { formatDate, formatDateShort, formatMoney } from "@/lib/format";
import { ToastNotifier } from "@/components/ToastNotifier";
import { resendCustomerInvite, updateCustomer } from "../actions";

const TOASTS = [
  { param: "saved" },
  { param: "error", tone: "error" as const },
];

export default async function StaffCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireFullStaff();
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
    <div className="space-y-8 animate-fade-up">
      <ToastNotifier toasts={TOASTS} />
      <header>
        <h1 className="font-display text-3xl font-bold text-ink-900">
          {customer.full_name || "(no name)"}
        </h1>
        <p className="mt-1 break-all text-ink-700">{customer.email}</p>
      </header>

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">
              Details
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Edit contact info. Email is the login and can&apos;t be changed
              here.
            </p>
          </div>
          <form action={resendCustomerInvite} className="shrink-0">
            <input type="hidden" name="id" value={customer.id} />
            <button type="submit" className="btn-secondary text-sm">
              <Mail size={16} /> Resend account link
            </button>
          </form>
        </div>
        <form action={updateCustomer} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={customer.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="full_name" className="label">
                Full name
              </label>
              <input
                id="full_name"
                name="full_name"
                defaultValue={customer.full_name ?? ""}
                placeholder="Jane Doe"
                className="input"
              />
            </div>
            <div>
              <label htmlFor="phone" className="label">
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={customer.phone ?? ""}
                placeholder="(555) 123-4567"
                className="input"
              />
            </div>
          </div>
          <div>
            <label htmlFor="address" className="label">
              Address
            </label>
            <input
              id="address"
              name="address"
              defaultValue={customer.address ?? ""}
              placeholder="123 Main St, Anytown"
              className="input"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="emergency_contact_name" className="label">
                Emergency contact name
              </label>
              <input
                id="emergency_contact_name"
                name="emergency_contact_name"
                defaultValue={customer.emergency_contact_name ?? ""}
                placeholder="Contact name"
                className="input"
              />
            </div>
            <div>
              <label htmlFor="emergency_contact_phone" className="label">
                Emergency contact phone
              </label>
              <input
                id="emergency_contact_phone"
                name="emergency_contact_phone"
                type="tel"
                defaultValue={customer.emergency_contact_phone ?? ""}
                placeholder="(555) 987-6543"
                className="input"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn-primary">
              Save details
            </button>
          </div>
        </form>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-ink-900">Dogs</h2>
          <Link
            href={`/staff/customers/${id}/dogs/new`}
            className="btn-secondary inline-flex items-center gap-2 text-sm"
          >
            <PlusCircle size={16} /> Add dog
          </Link>
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {dogs.map((d) => (
            <li
              key={d.id}
              className="card-lift flex items-center justify-between gap-4"
            >
              <Link
                href={`/staff/dogs/${d.id}`}
                className="flex min-w-0 flex-1 items-center gap-4"
              >
                <DogAvatar photoPath={d.photo_path} name={d.name} />
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-semibold text-ink-900">
                    {d.name}
                  </p>
                  <p className="truncate text-sm text-ink-500">
                    {d.breed ?? "Mixed breed"}
                  </p>
                </div>
              </Link>
              <Link
                href={`/staff/customers/${id}/book?dog=${d.id}`}
                className="btn-secondary inline-flex shrink-0 items-center gap-1.5 text-sm"
              >
                <CalendarPlus size={15} /> Book
              </Link>
            </li>
          ))}
          {dogs.length === 0 && (
            <li className="text-sm text-ink-500">No dogs on file.</li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold text-ink-900">
          Waiver
        </h2>
        {sigs.length === 0 ? (
          <p className="mt-2 text-sm font-medium text-red-700">
            No waiver on file.
          </p>
        ) : (
          <ul className="mt-2 text-sm text-ink-700">
            {sigs.map((s) => (
              <li key={s.id}>
                Signed by <strong>{s.signed_full_name}</strong> on{" "}
                {formatDate(s.signed_at)}
                {s.ip_address ? ` (${s.ip_address})` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold text-ink-900">
          Packages
        </h2>
        {packages.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">No purchases.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200/80 rounded-2xl border border-stone-200/80 bg-white shadow-soft">
            {packages.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between px-5 py-4 text-sm"
              >
                <div>
                  <p className="font-semibold text-ink-900">
                    {p.days_remaining} / {p.days_total} days remaining
                  </p>
                  <p className="text-ink-500">
                    {formatDate(p.created_at)} ·{" "}
                    {formatMoney(p.amount_paid_cents)} · {p.payment_status}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-ink-900">
            Recent bookings
          </h2>
          {dogs.length > 0 && (
            <Link
              href={`/staff/customers/${id}/book`}
              className="btn-secondary inline-flex items-center gap-2 text-sm"
            >
              <CalendarPlus size={16} /> New booking
            </Link>
          )}
        </div>
        {bookings.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">None.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200/80 rounded-2xl border border-stone-200/80 bg-white shadow-soft">
            {bookings.map((b) => {
              const dog = dogs.find((d) => d.id === b.dog_id);
              return (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-5 py-3 text-sm"
                >
                  <span className="font-medium text-ink-900">
                    {formatDateShort(b.service_date)} — {dog?.name ?? "Dog"}
                  </span>
                  <span className="text-ink-500">
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

import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Booking, CheckIn, Dog, Profile } from "@/lib/supabase/types";
import { todayISO } from "@/lib/format";
import { formatTime } from "@/lib/hours";
import { DogAvatar } from "@/components/DogAvatar";
import { StaffSubNav } from "@/components/StaffSubNav";
import { getPendingVaccineCount } from "@/lib/vaccines.server";
import { checkInBooking, checkOutBooking } from "./actions";

const SUBNAV = [
  { href: "/staff", label: "Today", active: true },
  { href: "/staff/overview", label: "Numbers" },
];

export default async function StaffTodayPage() {
  await requireStaff();
  const supabase = await createClient();
  const today = todayISO();

  // Today's bookings with their dog + customer + check-in.
  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("*")
    .eq("service_date", today)
    .neq("status", "canceled")
    .order("drop_off_time", { nullsFirst: true });
  const bookings = (bookingsData ?? []) as Booking[];

  const dogIds = Array.from(new Set(bookings.map((b) => b.dog_id)));
  const custIds = Array.from(new Set(bookings.map((b) => b.customer_id)));
  const bookingIds = bookings.map((b) => b.id);

  const [dogsRes, custsRes, checkInsRes] = await Promise.all([
    dogIds.length
      ? supabase.from("dogs").select("*").in("id", dogIds)
      : Promise.resolve({ data: [] as Dog[] }),
    custIds.length
      ? supabase.from("profiles").select("*").in("id", custIds)
      : Promise.resolve({ data: [] as Profile[] }),
    bookingIds.length
      ? supabase.from("check_ins").select("*").in("booking_id", bookingIds)
      : Promise.resolve({ data: [] as CheckIn[] }),
  ]);

  const dogs = (dogsRes.data ?? []) as Dog[];
  const custs = (custsRes.data ?? []) as Profile[];
  const checkIns = (checkInsRes.data ?? []) as CheckIn[];

  const onSite = bookings.filter((b) => {
    const ci = checkIns.find((c) => c.booking_id === b.id);
    return ci?.checked_in_at && !ci.checked_out_at;
  });

  const pendingVaccines = await getPendingVaccineCount();

  return (
    <div className="space-y-8">
      <StaffSubNav items={SUBNAV} />
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Today</h1>
          <p className="text-stone-600">
            {bookings.length} booked · {onSite.length} on site
          </p>
        </div>
      </header>

      {pendingVaccines > 0 && (
        <Link
          href="/staff/vaccines"
          className="block rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <span className="font-semibold">
            {pendingVaccines} vaccine record
            {pendingVaccines === 1 ? "" : "s"} pending review
          </span>
          <span className="ml-2 text-amber-800">— customers can&apos;t book until you approve.</span>
        </Link>
      )}

      {bookings.length === 0 ? (
        <p className="text-stone-600">No bookings today.</p>
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => {
            const dog = dogs.find((d) => d.id === b.dog_id);
            const cust = custs.find((c) => c.id === b.customer_id);
            const ci = checkIns.find((c) => c.booking_id === b.id);
            return (
              <li key={b.id} className="card flex flex-wrap items-center gap-4">
                {dog && <DogAvatar photoPath={dog.photo_path} name={dog.name} size={56} />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-stone-900">
                    {dog?.name ?? "Dog"}{" "}
                    <span className="text-stone-500">· {cust?.full_name || cust?.email}</span>
                  </p>
                  <p className="text-sm text-stone-500">
                    {b.payment_kind === "package" ? "Package day" : "Drop-in"} · {b.status} ·{" "}
                    {b.payment_status}
                  </p>
                  {(b.drop_off_time || b.pickup_time) && (
                    <p className="text-xs text-stone-500">
                      {b.drop_off_time && <>Drop-off {formatTime(b.drop_off_time)}</>}
                      {b.drop_off_time && b.pickup_time && " · "}
                      {b.pickup_time && <>Pickup {formatTime(b.pickup_time)}</>}
                    </p>
                  )}
                  {dog && (
                    <Link
                      href={`/staff/dogs/${dog.id}`}
                      className="text-xs font-medium text-brand-700 hover:underline"
                    >
                      Open profile →
                    </Link>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!ci?.checked_in_at ? (
                    <form action={checkInBooking}>
                      <input type="hidden" name="booking_id" value={b.id} />
                      <button type="submit" className="btn-primary text-sm">
                        Check in
                      </button>
                    </form>
                  ) : !ci?.checked_out_at ? (
                    <>
                      <span className="text-xs text-emerald-700">
                        In at {new Date(ci.checked_in_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                      <form action={checkOutBooking}>
                        <input type="hidden" name="booking_id" value={b.id} />
                        <button type="submit" className="btn-secondary text-sm">
                          Check out
                        </button>
                      </form>
                    </>
                  ) : (
                    <span className="text-xs text-stone-500">
                      Out at {new Date(ci.checked_out_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

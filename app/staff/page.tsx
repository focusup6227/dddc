import Link from "next/link";
import { AlertTriangle, ArrowRight, PawPrint } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Booking, CheckIn, Dog, Profile } from "@/lib/supabase/types";
import { todayISO } from "@/lib/format";
import { formatTime } from "@/lib/hours";
import { DogAvatar } from "@/components/DogAvatar";
import { StaffSubNav } from "@/components/StaffSubNav";
import { EmptyState } from "@/components/EmptyState";
import { SleepingDog } from "@/components/illustrations";
import { getPendingVaccineCount } from "@/lib/vaccines.server";
import { firstName, getGreeting } from "@/lib/greeting";
import { checkInBooking, checkOutBooking } from "./actions";

const SUBNAV = [
  { href: "/staff", label: "Today", active: true },
  { href: "/staff/overview", label: "Numbers" },
];

export default async function StaffTodayPage() {
  const { profile } = await requireStaff();
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

  const greeting = getGreeting();
  const first = firstName(profile.full_name) || "team";

  return (
    <div className="space-y-8 animate-fade-up">
      <StaffSubNav items={SUBNAV} />
      <header className="relative overflow-hidden rounded-3xl border border-stone-200/80 bg-white px-6 py-7 shadow-soft sm:px-10 sm:py-9">
        <div className="absolute -right-6 -bottom-6 text-brand-100">
          <PawPrint size={140} strokeWidth={1} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
          {greeting}, {first}
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold text-ink-900 sm:text-5xl">
          Today
        </h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="pill-warm">{bookings.length} booked</span>
          <span className="pill-success">{onSite.length} on site</span>
          {pendingVaccines > 0 && (
            <span className="pill-warn">
              {pendingVaccines} vaccine review{pendingVaccines === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </header>

      {pendingVaccines > 0 && (
        <Link
          href="/staff/vaccines"
          className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4 text-sm shadow-soft transition-shadow hover:shadow-lift"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <AlertTriangle size={18} />
            </span>
            <div>
              <p className="font-semibold text-amber-900">
                {pendingVaccines} vaccine record
                {pendingVaccines === 1 ? "" : "s"} pending review
              </p>
              <p className="text-xs text-amber-800">
                Customers can&apos;t book until you approve.
              </p>
            </div>
          </div>
          <ArrowRight size={18} className="text-amber-700" />
        </Link>
      )}

      {bookings.length === 0 ? (
        <EmptyState
          illustration={<SleepingDog className="h-full w-auto" />}
          title="A quiet day"
          description="No bookings on the schedule for today. Catch your breath."
        />
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => {
            const dog = dogs.find((d) => d.id === b.dog_id);
            const cust = custs.find((c) => c.id === b.customer_id);
            const ci = checkIns.find((c) => c.booking_id === b.id);
            return (
              <li key={b.id} className="card-lift flex flex-wrap items-center gap-4">
                {dog && <DogAvatar photoPath={dog.photo_path} name={dog.name} size={56} />}
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-semibold text-ink-900">
                    {dog?.name ?? "Dog"}{" "}
                    <span className="font-sans text-sm font-normal text-ink-500">
                      · {cust?.full_name || cust?.email}
                    </span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="pill-neutral">
                      {b.payment_kind === "package" ? "Package" : "Drop-in"}
                    </span>
                    <span className="pill-neutral">{b.status}</span>
                    <span
                      className={
                        b.payment_status === "paid"
                          ? "pill-success"
                          : b.payment_status === "unpaid"
                            ? "pill-warn"
                            : "pill-neutral"
                      }
                    >
                      {b.payment_status}
                    </span>
                  </div>
                  {(b.drop_off_time || b.pickup_time) && (
                    <p className="mt-1.5 text-xs text-ink-500">
                      {b.drop_off_time && <>Drop-off {formatTime(b.drop_off_time)}</>}
                      {b.drop_off_time && b.pickup_time && " · "}
                      {b.pickup_time && <>Pickup {formatTime(b.pickup_time)}</>}
                    </p>
                  )}
                  {dog && (
                    <Link
                      href={`/staff/dogs/${dog.id}`}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900 hover:underline"
                    >
                      Open profile <ArrowRight size={12} />
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
                    <span className="text-xs text-ink-500">
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

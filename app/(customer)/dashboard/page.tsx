import Link from "next/link";
import {
  ArrowRight,
  CalendarPlus,
  CreditCard,
  Dog as DogIcon,
  Sparkles,
  Ticket,
} from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDateShort, formatMoney, todayISO } from "@/lib/format";
import type {
  Booking,
  CustomerPackage,
  Dog,
  Event,
  ReportCard,
  ReportCardPhoto,
} from "@/lib/supabase/types";
import { ReportCardView } from "@/components/ReportCardView";
import { EventList } from "@/components/EventList";
import { EmptyState } from "@/components/EmptyState";
import { EmptyCalendar, MascotFace } from "@/components/illustrations";
import { firstName, getGreeting } from "@/lib/greeting";
import { payAllUnpaid } from "../bookings/actions";

export default async function CustomerDashboard() {
  const { userId, profile } = await requireCustomer();
  const supabase = await createClient();

  const [dogsRes, bookingsRes, packagesRes, unpaidRes] = await Promise.all([
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
    supabase
      .from("bookings")
      .select("*")
      .eq("customer_id", userId)
      .eq("payment_status", "unpaid")
      .eq("status", "reserved"),
  ]);

  const dogs = (dogsRes.data ?? []) as Dog[];
  const bookings = (bookingsRes.data ?? []) as Booking[];
  const packages = (packagesRes.data ?? []) as CustomerPackage[];
  const totalDays = packages.reduce((s, p) => s + p.days_remaining, 0);
  const unpaid = (unpaidRes.data ?? []) as Booking[];
  const balanceCents = unpaid.reduce((sum, b) => {
    const [y1, m1, d1] = b.service_date.split("-").map(Number);
    const [y2, m2, d2] = b.service_end_date.split("-").map(Number);
    const nights = Math.max(
      1,
      Math.round(
        (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000,
      ),
    );
    return sum + (b.unit_price_cents ?? 0) * nights;
  }, 0);

  const today = todayISO();
  const horizon = addDays(today, 90);
  const { data: eventsData } = await supabase
    .from("events")
    .select("*")
    .gte("end_date", today)
    .lte("start_date", horizon)
    .order("start_date")
    .limit(3);
  const upcomingEvents = (eventsData ?? []) as Event[];

  // Latest published report card across all of the customer's bookings.
  // RLS filters to published + owned, so we can just take the newest.
  const { data: latestCardData } = await supabase
    .from("report_cards")
    .select("*")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle<ReportCard>();
  const latestCard = latestCardData;

  let latestCardPhotos: ReportCardPhoto[] = [];
  let latestCardDog: Dog | null = null;
  if (latestCard) {
    const [photosRes, bookingRes] = await Promise.all([
      supabase
        .from("report_card_photos")
        .select("*")
        .eq("report_card_id", latestCard.id)
        .order("sort_order")
        .order("uploaded_at"),
      supabase
        .from("bookings")
        .select("dog_id")
        .eq("id", latestCard.booking_id)
        .maybeSingle<{ dog_id: string }>(),
    ]);
    latestCardPhotos = (photosRes.data ?? []) as ReportCardPhoto[];
    const dogId = bookingRes.data?.dog_id;
    if (dogId) latestCardDog = dogs.find((d) => d.id === dogId) ?? null;
  }

  const greeting = getGreeting();
  const first = firstName(profile.full_name) || "there";

  return (
    <div className="space-y-8 animate-fade-up">
      <header className="relative overflow-hidden rounded-3xl border border-stone-200/80 bg-warm-fade px-6 py-8 shadow-soft sm:px-10 sm:py-12">
        <div className="absolute -right-6 -top-6 hidden h-44 w-44 text-brand-200 sm:block">
          <MascotFace className="h-full w-full" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
          {greeting}
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold text-ink-900 sm:text-5xl">
          {first} 🐾
        </h1>
        <p className="mt-3 max-w-md text-ink-700">
          Here&apos;s the latest on your pups and bookings.
        </p>
      </header>

      {profile.account_credit_cents > 0 && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-4 shadow-soft">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Sparkles size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-900">
                {formatMoney(profile.account_credit_cents)} in account credit
              </p>
              <p className="text-xs text-emerald-800">
                Applied automatically at checkout.
              </p>
            </div>
          </div>
          <Link
            href="/account"
            className="text-sm font-semibold text-emerald-700 hover:text-emerald-900 hover:underline"
          >
            See referrals →
          </Link>
        </section>
      )}

      {unpaid.length > 0 && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4 shadow-soft">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <CreditCard size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Outstanding balance: {formatMoney(balanceCents)}
              </p>
              <p className="text-xs text-amber-800">
                {unpaid.length} unpaid booking{unpaid.length === 1 ? "" : "s"}.
              </p>
            </div>
          </div>
          <form action={payAllUnpaid}>
            <button type="submit" className="btn-primary">
              Pay {formatMoney(balanceCents)}
            </button>
          </form>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          title="Dogs"
          value={String(dogs.length)}
          icon={<DogIcon size={20} />}
          cta={dogs.length ? { href: "/dogs", label: "Manage" } : { href: "/dogs/new", label: "Add a dog" }}
        />
        <StatCard
          title="Days remaining"
          value={String(totalDays)}
          icon={<Ticket size={20} />}
          cta={{ href: "/packages", label: totalDays ? "Buy more" : "Buy a package" }}
        />
        <StatCard
          title="Upcoming bookings"
          value={String(bookings.length)}
          icon={<CalendarPlus size={20} />}
          cta={{ href: "/book", label: "Book a day" }}
        />
      </div>

      {upcomingEvents.length > 0 && (
        <EventList
          events={upcomingEvents}
          title="Upcoming events"
          emptyText="Nothing scheduled."
        />
      )}

      {latestCard && latestCardDog && (
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-ink-900">
              Latest report card
            </h2>
            <Link
              href="/bookings"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              See all →
            </Link>
          </div>
          <ReportCardView
            card={latestCard}
            photos={latestCardPhotos}
            dogName={latestCardDog.name}
            variant="teaser"
          />
        </section>
      )}

      <section>
        <h2 className="font-display text-xl font-semibold text-ink-900">Upcoming bookings</h2>
        {bookings.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              illustration={<EmptyCalendar className="h-full w-auto" />}
              title="No upcoming bookings"
              description="Quiet calendar over here — book a day to get on the schedule."
              action={
                <Link href="/book" className="btn-primary">
                  <CalendarPlus size={16} /> Book a day
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-stone-200/80 rounded-2xl border border-stone-200/80 bg-white shadow-soft">
            {bookings.map((b) => {
              const dog = dogs.find((d) => d.id === b.dog_id);
              return (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">
                      {formatDateShort(b.service_date)} — {dog?.name ?? "Dog"}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-500">
                      {b.payment_kind === "package" ? "Package day" : "Drop-in"} · {b.status}
                    </p>
                  </div>
                  <Link
                    href="/bookings"
                    className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-900 hover:underline"
                  >
                    Details <ArrowRight size={14} />
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
  icon,
  cta,
}: {
  title: string;
  value: string;
  icon?: React.ReactNode;
  cta: { href: string; label: string };
}) {
  return (
    <Link href={cta.href} className="card-lift block group">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          {title}
        </p>
        {icon && (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            {icon}
          </span>
        )}
      </div>
      <p className="mt-3 font-display text-4xl font-bold text-ink-900">{value}</p>
      <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 group-hover:gap-1.5 transition-all">
        {cta.label} <ArrowRight size={14} />
      </p>
    </Link>
  );
}

import Link from "next/link";
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

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">
          Hi {profile.full_name?.split(" ")[0] || "there"} 👋
        </h1>
        <p className="text-stone-600">Here&apos;s what&apos;s happening.</p>
      </header>

      {unpaid.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                Outstanding balance: {formatMoney(balanceCents)}
              </p>
              <p className="text-xs text-amber-800">
                {unpaid.length} unpaid booking{unpaid.length === 1 ? "" : "s"}.
              </p>
            </div>
            <form action={payAllUnpaid}>
              <button type="submit" className="btn-primary">
                Pay {formatMoney(balanceCents)}
              </button>
            </form>
          </div>
        </section>
      )}

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
            <h2 className="text-lg font-semibold text-stone-900">
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

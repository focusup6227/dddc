import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Booking, Dog, Profile, ReportCard } from "@/lib/supabase/types";
import { DogAvatar } from "@/components/DogAvatar";
import { formatDateShort, todayISO } from "@/lib/format";

// Show bookings from the last 60 days that have actually happened
// (or are happening now) — that's when a report card makes sense.
const LOOKBACK_DAYS = 60;

export default async function StaffReportCardsPage() {
  await requireStaff();
  const supabase = await createClient();

  const today = todayISO();
  const from = shiftDays(today, -LOOKBACK_DAYS);

  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("*")
    .in("status", ["checked_in", "checked_out", "no_show"])
    .gte("service_date", from)
    .order("service_date", { ascending: false });
  const bookings = (bookingsData ?? []) as Booking[];

  const bookingIds = bookings.map((b) => b.id);
  const dogIds = Array.from(new Set(bookings.map((b) => b.dog_id)));
  const custIds = Array.from(new Set(bookings.map((b) => b.customer_id)));

  const [cardsRes, dogsRes, custsRes] = await Promise.all([
    bookingIds.length
      ? supabase
          .from("report_cards")
          .select("*")
          .in("booking_id", bookingIds)
      : Promise.resolve({ data: [] }),
    dogIds.length
      ? supabase.from("dogs").select("*").in("id", dogIds)
      : Promise.resolve({ data: [] }),
    custIds.length
      ? supabase.from("profiles").select("*").in("id", custIds)
      : Promise.resolve({ data: [] }),
  ]);
  const cards = (cardsRes.data ?? []) as ReportCard[];
  const dogs = (dogsRes.data ?? []) as Dog[];
  const custs = (custsRes.data ?? []) as Profile[];

  const cardByBooking = new Map(cards.map((c) => [c.booking_id, c]));
  const dogById = new Map(dogs.map((d) => [d.id, d]));
  const custById = new Map(custs.map((c) => [c.id, c]));

  const needsCard = bookings.filter((b) => !cardByBooking.has(b.id));
  const drafts = bookings.filter((b) => {
    const c = cardByBooking.get(b.id);
    return c && !c.published_at;
  });
  const published = bookings.filter((b) => {
    const c = cardByBooking.get(b.id);
    return c && c.published_at;
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">Report cards</h1>
        <p className="text-stone-600">
          Send a cute note + photos home from each stay. 🐾
        </p>
      </header>

      <Section
        title="Needs a card"
        emptyText="Caught up — every recent stay has a card started."
        bookings={needsCard}
        dogById={dogById}
        custById={custById}
        cardByBooking={cardByBooking}
        ctaLabel="Write card"
      />

      <Section
        title="Drafts"
        emptyText="No drafts."
        bookings={drafts}
        dogById={dogById}
        custById={custById}
        cardByBooking={cardByBooking}
        ctaLabel="Continue"
      />

      <Section
        title="Published"
        emptyText="No cards published yet."
        bookings={published}
        dogById={dogById}
        custById={custById}
        cardByBooking={cardByBooking}
        ctaLabel="View / edit"
      />
    </div>
  );
}

function Section({
  title,
  emptyText,
  bookings,
  dogById,
  custById,
  cardByBooking,
  ctaLabel,
}: {
  title: string;
  emptyText: string;
  bookings: Booking[];
  dogById: Map<string, Dog>;
  custById: Map<string, Profile>;
  cardByBooking: Map<string, ReportCard>;
  ctaLabel: string;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-stone-900">
        {title}{" "}
        <span className="ml-1 text-sm font-normal text-stone-500">
          ({bookings.length})
        </span>
      </h2>
      {bookings.length === 0 ? (
        <p className="mt-2 text-stone-600">{emptyText}</p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {bookings.map((b) => {
            const dog = dogById.get(b.dog_id);
            const cust = custById.get(b.customer_id);
            const card = cardByBooking.get(b.id);
            return (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <DogAvatar
                    photoPath={dog?.photo_path ?? null}
                    name={dog?.name ?? "Dog"}
                    size={44}
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-stone-900">
                      {dog?.name ?? "Dog"}{" "}
                      <span className="text-stone-500">
                        · {cust?.full_name || cust?.email}
                      </span>
                    </p>
                    <p className="text-xs text-stone-500">
                      {b.service_kind === "boarding"
                        ? `${formatDateShort(b.service_date)} → ${formatDateShort(b.service_end_date)} · Boarding`
                        : `${formatDateShort(b.service_date)} · Daycare`}{" "}
                      · {b.status.replace("_", " ")}
                      {card?.published_at && (
                        <>
                          {" · "}
                          <span className="text-emerald-700">
                            Published {formatDateShort(card.published_at.slice(0, 10))}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/staff/report-cards/${b.id}`}
                  className="btn-secondary text-sm"
                >
                  {ctaLabel}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function shiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, (d ?? 1) + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

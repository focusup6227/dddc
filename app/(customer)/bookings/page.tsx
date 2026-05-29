import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Booking,
  Dog,
  ReportCard,
  ReportCardPhoto,
} from "@/lib/supabase/types";
import { formatDateShort, formatMoney, todayISO } from "@/lib/format";
import { formatTime } from "@/lib/hours";
import { isPastDueUnpaid, refundFractionForBooking } from "@/lib/bookings.server";
import { materializeForCustomer } from "@/lib/recurring.server";
import { ReportCardView } from "@/components/ReportCardView";
import { ToastNotifier } from "@/components/ToastNotifier";
import {
  applyCouponToBooking,
  cancelBooking,
  payAllUnpaid,
  payBooking,
  removeCouponFromBooking,
} from "./actions";
import ConfirmCancelButton from "./ConfirmCancelButton";

const TOASTS = [
  { param: "paid", message: "Payment received — your booking is confirmed." },
  {
    param: "canceled",
    tone: "info" as const,
    message: "Payment canceled. You can try again whenever you're ready.",
  },
  { param: "coupon", message: "Coupon applied." },
  { param: "error", tone: "error" as const },
];

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    paid?: string;
    canceled?: string;
    error?: string;
    coupon?: string;
  }>;
}) {
  const { userId } = await requireCustomer();
  const supabase = await createClient();
  const params = await searchParams;

  // Keep the 28-day horizon of standing-schedule bookings up to date.
  await materializeForCustomer(userId);

  const [bookingsRes, dogsRes] = await Promise.all([
    supabase
      .from("bookings")
      .select("*")
      .eq("customer_id", userId)
      .order("service_date", { ascending: false })
      .limit(50),
    supabase.from("dogs").select("*").eq("owner_id", userId),
  ]);
  const bookings = (bookingsRes.data ?? []) as Booking[];
  const dogs = (dogsRes.data ?? []) as Dog[];
  const today = todayISO();

  // RLS only returns cards that are published AND on the customer's bookings,
  // so a simple "any card on these bookings" select is safe.
  const bookingIds = bookings.map((b) => b.id);
  const [cardsRes, photosRes] = bookingIds.length
    ? await Promise.all([
        supabase
          .from("report_cards")
          .select("*")
          .in("booking_id", bookingIds),
        supabase
          .from("report_card_photos")
          .select("*")
          .order("sort_order")
          .order("uploaded_at"),
      ])
    : [{ data: [] }, { data: [] }];
  const cards = (cardsRes.data ?? []) as ReportCard[];
  const allPhotos = (photosRes.data ?? []) as ReportCardPhoto[];

  const cardByBooking = new Map(cards.map((c) => [c.booking_id, c]));
  const photosByCard = new Map<string, ReportCardPhoto[]>();
  for (const p of allPhotos) {
    const arr = photosByCard.get(p.report_card_id) ?? [];
    arr.push(p);
    photosByCard.set(p.report_card_id, arr);
  }

  const upcoming = bookings.filter((b) => b.service_date >= today && b.status !== "canceled");
  const past = bookings.filter((b) => b.service_date < today || b.status === "canceled");

  const unpaidBookings = bookings.filter(
    (b) => b.status === "reserved" && b.payment_status === "unpaid",
  );
  const balanceCents = unpaidBookings.reduce((sum, b) => {
    const nights = Math.max(1, nightCount(b.service_date, b.service_end_date));
    return sum + (b.unit_price_cents ?? 0) * nights;
  }, 0);

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900">
          Bookings
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Upcoming days, past stays, report cards, and payments — all here.
        </p>
      </div>

      <ToastNotifier toasts={TOASTS} />

      {unpaidBookings.length > 0 && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4 shadow-soft">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              Outstanding balance: {formatMoney(balanceCents)}
            </p>
            <p className="text-xs text-amber-800">
              {unpaidBookings.length} unpaid booking
              {unpaidBookings.length === 1 ? "" : "s"} — pay everything in one
              checkout.
            </p>
          </div>
          <form action={payAllUnpaid}>
            <button type="submit" className="btn-primary">
              Pay {formatMoney(balanceCents)}
            </button>
          </form>
        </section>
      )}

      <Section
        title="Upcoming"
        bookings={upcoming}
        dogs={dogs}
        today={today}
        cardByBooking={cardByBooking}
        photosByCard={photosByCard}
        cancelable
      />
      <Section
        title="Past"
        bookings={past}
        dogs={dogs}
        today={today}
        cardByBooking={cardByBooking}
        photosByCard={photosByCard}
      />
    </div>
  );
}

function nightCount(start: string, end: string): number {
  const [y1, m1, d1] = start.split("-").map(Number);
  const [y2, m2, d2] = end.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.max(0, Math.round((b - a) / 86400000));
}

function refundPreview(b: Booking): string {
  const fraction = refundFractionForBooking(b.service_date, "customer");
  if (b.payment_kind === "package") {
    return fraction === 1
      ? "Full refund: 1 day returned to your package."
      : "Within 24h: package day will be forfeited (no refund).";
  }
  if (b.payment_status !== "paid" || !b.unit_price_cents) {
    return "No charge to refund.";
  }
  const nights = Math.max(1, nightCount(b.service_date, b.service_end_date));
  const total = b.unit_price_cents * nights;
  const amount = Math.round(total * fraction);
  return fraction === 1
    ? `Full refund of ${formatMoney(amount)}.`
    : `Within 24h: 50% refund of ${formatMoney(amount)}.`;
}

function Section({
  title,
  bookings,
  dogs,
  today,
  cardByBooking,
  photosByCard,
  cancelable,
}: {
  title: string;
  bookings: Booking[];
  dogs: Dog[];
  today: string;
  cardByBooking: Map<string, ReportCard>;
  photosByCard: Map<string, ReportCardPhoto[]>;
  cancelable?: boolean;
}) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold text-ink-900">{title}</h2>
      {bookings.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">None.</p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-200/80 rounded-2xl border border-stone-200/80 bg-white shadow-soft">
          {bookings.map((b) => {
            const dog = dogs.find((d) => d.id === b.dog_id);
            const isUnpaid =
              b.status === "reserved" && b.payment_status === "unpaid";
            const isPastDue = isPastDueUnpaid(b, today);
            // Past-due unpaid rows can't be canceled — the customer must pay.
            const showCancel =
              cancelable && b.status === "reserved" && !isPastDue;
            const showPayNow = isUnpaid;
            const preview = showCancel ? refundPreview(b) : "";
            const card = cardByBooking.get(b.id);
            const cardPhotos = card ? photosByCard.get(card.id) ?? [] : [];
            return (
              <li key={b.id} className="px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-900">
                    {b.service_kind === "boarding"
                      ? `${formatDateShort(b.service_date)} → ${formatDateShort(b.service_end_date)}`
                      : formatDateShort(b.service_date)}{" "}
                    — {dog?.name ?? "Dog"}
                  </p>
                  <p className="text-sm text-ink-500">
                    {b.service_kind === "boarding"
                      ? `Boarding · ${nightCount(b.service_date, b.service_end_date)} night${nightCount(b.service_date, b.service_end_date) === 1 ? "" : "s"}`
                      : b.payment_kind === "package"
                        ? "Package day"
                        : "Drop-in"}{" "}
                    · {b.status} · {b.payment_status}
                    {b.refund_amount_cents != null && b.refund_amount_cents > 0 && (
                      <> · refunded {formatMoney(b.refund_amount_cents)}</>
                    )}
                  </p>
                  {(b.drop_off_time || b.pickup_time) && (
                    <p className="text-xs text-ink-500">
                      {b.drop_off_time && <>Drop-off {formatTime(b.drop_off_time)}</>}
                      {b.drop_off_time && b.pickup_time && " · "}
                      {b.pickup_time && <>Pickup {formatTime(b.pickup_time)}</>}
                    </p>
                  )}
                  {isPastDue && (
                    <p className="mt-1 text-xs font-medium text-red-700">
                      Past due — please pay to keep your account active.
                    </p>
                  )}
                  {showCancel && <p className="mt-1 text-xs text-ink-500">{preview}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {showPayNow && (
                    <form action={payBooking}>
                      <input type="hidden" name="id" value={b.id} />
                      <button type="submit" className="btn-primary text-sm">
                        Pay now
                        {b.unit_price_cents
                          ? ` · ${formatMoney(Math.max(0, b.unit_price_cents * Math.max(1, nightCount(b.service_date, b.service_end_date)) - (b.coupon_discount_cents ?? 0)))}`
                          : ""}
                      </button>
                    </form>
                  )}
                  {showCancel && (
                    <form action={cancelBooking}>
                      <input type="hidden" name="id" value={b.id} />
                      <ConfirmCancelButton preview={preview} />
                    </form>
                  )}
                </div>
                </div>
                {showPayNow && (
                  <CouponRow
                    bookingId={b.id}
                    couponDiscountCents={b.coupon_discount_cents}
                  />
                )}
                {card && card.published_at && (
                  <div className="mt-3">
                    <ReportCardView
                      card={card}
                      photos={cardPhotos}
                      dogName={dog?.name ?? "Dog"}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CouponRow({
  bookingId,
  couponDiscountCents,
}: {
  bookingId: string;
  couponDiscountCents: number;
}) {
  if (couponDiscountCents > 0) {
    return (
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        <span>
          Coupon applied —{" "}
          <strong>−{formatMoney(couponDiscountCents)}</strong> off
        </span>
        <form action={removeCouponFromBooking}>
          <input type="hidden" name="id" value={bookingId} />
          <button
            type="submit"
            className="text-xs font-medium text-emerald-800 underline hover:text-emerald-900"
          >
            Remove
          </button>
        </form>
      </div>
    );
  }
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-ink-500 hover:text-ink-700">
        Have a coupon code?
      </summary>
      <form action={applyCouponToBooking} className="mt-2 flex gap-2">
        <input type="hidden" name="id" value={bookingId} />
        <input
          type="text"
          name="code"
          required
          placeholder="Enter code"
          className="input flex-1 text-sm uppercase sm:max-w-xs"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-stone-50"
        >
          Apply
        </button>
      </form>
    </details>
  );
}

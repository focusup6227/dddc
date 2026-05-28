import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Booking, Dog } from "@/lib/supabase/types";
import { formatDateShort, formatMoney, todayISO } from "@/lib/format";
import { refundFractionForBooking } from "@/lib/bookings.server";
import { cancelBooking } from "./actions";
import ConfirmCancelButton from "./ConfirmCancelButton";

export default async function BookingsPage() {
  const { userId } = await requireCustomer();
  const supabase = await createClient();

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

  const upcoming = bookings.filter((b) => b.service_date >= today && b.status !== "canceled");
  const past = bookings.filter((b) => b.service_date < today || b.status === "canceled");

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-stone-900">Bookings</h1>

      <Section title="Upcoming" bookings={upcoming} dogs={dogs} cancelable />
      <Section title="Past" bookings={past} dogs={dogs} />
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
  cancelable,
}: {
  title: string;
  bookings: Booking[];
  dogs: Dog[];
  cancelable?: boolean;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
      {bookings.length === 0 ? (
        <p className="mt-2 text-stone-600">None.</p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {bookings.map((b) => {
            const dog = dogs.find((d) => d.id === b.dog_id);
            const showCancel = cancelable && b.status === "reserved";
            const preview = showCancel ? refundPreview(b) : "";
            return (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-stone-900">
                    {b.service_kind === "boarding"
                      ? `${formatDateShort(b.service_date)} → ${formatDateShort(b.service_end_date)}`
                      : formatDateShort(b.service_date)}{" "}
                    — {dog?.name ?? "Dog"}
                  </p>
                  <p className="text-sm text-stone-500">
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
                  {showCancel && <p className="mt-1 text-xs text-stone-500">{preview}</p>}
                </div>
                {showCancel && (
                  <form action={cancelBooking}>
                    <input type="hidden" name="id" value={b.id} />
                    <ConfirmCancelButton preview={preview} />
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

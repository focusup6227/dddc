import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Booking, Dog } from "@/lib/supabase/types";
import { formatDateShort, todayISO } from "@/lib/format";
import { cancelBooking } from "./actions";

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
            return (
              <li key={b.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-stone-900">
                    {formatDateShort(b.service_date)} — {dog?.name ?? "Dog"}
                  </p>
                  <p className="text-sm text-stone-500">
                    {b.payment_kind === "package" ? "Package day" : "Drop-in"} ·{" "}
                    {b.status} · {b.payment_status}
                  </p>
                </div>
                {cancelable && b.status === "reserved" && (
                  <form action={cancelBooking}>
                    <input type="hidden" name="id" value={b.id} />
                    <button type="submit" className="btn-secondary text-sm">
                      Cancel
                    </button>
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

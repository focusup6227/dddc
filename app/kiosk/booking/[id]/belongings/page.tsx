import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFullStaff } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getBelongings, lastStayBelongings } from "@/lib/belongings.server";
import { DogAvatar } from "@/components/DogAvatar";
import type { Belonging, Booking, Dog, Profile } from "@/lib/supabase/types";
import { kioskRemoveBelonging } from "../../../actions";
import { BelongingsAdder } from "../BelongingsAdder";

export const dynamic = "force-dynamic";

/**
 * The deliberate "log their stuff" step shown right after a dog is checked in.
 * Logging isn't forced — staff can leave with nothing logged — but it's a
 * screen you dismiss with Done rather than a section you might scroll past.
 */
export default async function BelongingsStepPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireFullStaff();
  const { id } = await params;
  const svc = createServiceClient();

  const { data: booking } = await svc
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle<Booking>();
  if (!booking) notFound();

  const [{ data: dog }, { data: cust }] = await Promise.all([
    svc.from("dogs").select("*").eq("id", booking.dog_id).maybeSingle<Dog>(),
    svc
      .from("profiles")
      .select("*")
      .eq("id", booking.customer_id)
      .maybeSingle<Profile>(),
  ]);
  if (!dog || !cust) notFound();

  const items = (await getBelongings(svc, booking.id)) as Belonging[];
  const prefillItems =
    items.length === 0
      ? await lastStayBelongings(svc, {
          dogId: booking.dog_id,
          excludeBookingId: booking.id,
        })
      : [];

  const returnTo = `/kiosk/booking/${booking.id}/belongings`;
  const ownerName = cust.full_name || cust.email;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center gap-4">
        <DogAvatar photoPath={dog.photo_path} name={dog.name} size={72} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-700">
            ✓ {dog.name} checked in
          </p>
          <h1 className="font-display text-3xl font-bold text-ink-900">
            What did {ownerName} drop off?
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Log it now so everything goes home with {dog.name} at pickup.
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-soft">
        {items.length === 0 ? (
          <p className="px-6 py-5 text-sm text-ink-500">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y divide-stone-200/80">
            {items.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 px-6 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">
                    {b.label}
                    {b.quantity > 1 && (
                      <span className="ml-1 text-ink-500">× {b.quantity}</span>
                    )}
                  </p>
                  {b.notes && <p className="text-xs text-ink-500">{b.notes}</p>}
                </div>
                <form action={kioskRemoveBelonging}>
                  <input type="hidden" name="belonging_id" value={b.id} />
                  <input type="hidden" name="booking_id" value={booking.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <button
                    type="submit"
                    aria-label={`Remove ${b.label}`}
                    className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm font-semibold text-ink-500 transition-colors hover:bg-red-50 hover:text-red-700"
                  >
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-stone-200/80 bg-cream-50 p-6">
          <BelongingsAdder
            bookingId={booking.id}
            prefillItems={prefillItems}
            returnTo={returnTo}
          />
        </div>
      </section>

      <Link
        href="/kiosk"
        className="block w-full rounded-3xl bg-emerald-600 px-6 py-6 text-center font-display text-2xl font-bold text-white shadow-soft transition-all hover:bg-emerald-700 hover:shadow-lift active:translate-y-px"
      >
        Done — back to today
      </Link>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFullStaff } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getBelongings,
  lastStayBelongings,
  QUICK_ADD_BELONGINGS,
} from "@/lib/belongings.server";
import { DogAvatar } from "@/components/DogAvatar";
import type { Belonging, Booking, Dog, Profile } from "@/lib/supabase/types";
import { BelongingsManager } from "../BelongingsManager";

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

      <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-soft">
        <BelongingsManager
          bookingId={booking.id}
          initialItems={items}
          prefillItems={prefillItems}
          quickAdd={[...QUICK_ADD_BELONGINGS]}
        />
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

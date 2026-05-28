import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format";
import { DogAvatar } from "@/components/DogAvatar";
import type { Booking, CheckIn, Dog, Profile } from "@/lib/supabase/types";
import { kioskCheckIn, kioskCheckOut, kioskTakePayment } from "../../actions";

export const dynamic = "force-dynamic";

export default async function KioskBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle<Booking>();
  if (!booking) notFound();

  const [{ data: dog }, { data: cust }, { data: ci }] = await Promise.all([
    supabase.from("dogs").select("*").eq("id", booking.dog_id).maybeSingle<Dog>(),
    supabase.from("profiles").select("*").eq("id", booking.customer_id).maybeSingle<Profile>(),
    supabase.from("check_ins").select("*").eq("booking_id", booking.id).maybeSingle<CheckIn>(),
  ]);
  if (!dog || !cust) notFound();

  const isPaid = booking.payment_status === "paid";
  const isCheckedIn = !!ci?.checked_in_at && !ci?.checked_out_at;
  const isCheckedOut = !!ci?.checked_out_at;

  return (
    <div className="space-y-6">
      <Link href="/kiosk" className="text-sm font-medium text-stone-600 hover:text-stone-900">
        ← Back to today
      </Link>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-5 p-6">
          <DogAvatar photoPath={dog.photo_path} name={dog.name} size={120} />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold text-stone-900">{dog.name}</h1>
            <p className="text-stone-600">
              {cust.full_name || cust.email}
              {cust.phone && <span className="ml-2 text-stone-500">· {cust.phone}</span>}
            </p>
            <p className="mt-1 text-sm text-stone-500">
              {booking.payment_kind === "package" ? "Package day" : "Drop-in"} ·{" "}
              {booking.status} · {booking.payment_status}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-stone-200 bg-stone-50 p-6 sm:grid-cols-2">
          <Field label="Vaccinations">
            {dog.vaccinations_current ? (
              <span className="text-emerald-700">Current</span>
            ) : (
              <span className="text-red-700">Not current</span>
            )}
            {dog.vaccination_notes && (
              <p className="text-xs text-stone-500">{dog.vaccination_notes}</p>
            )}
          </Field>
          <Field label="Allergies">{dog.allergies || <em className="text-stone-400">None noted</em>}</Field>
          <Field label="Medications">
            {dog.medications || <em className="text-stone-400">None</em>}
          </Field>
          <Field label="Feeding">
            {dog.feeding_notes || <em className="text-stone-400">None</em>}
          </Field>
          <Field label="Behavior">
            {dog.behavior_notes || <em className="text-stone-400">None noted</em>}
          </Field>
          <Field label="Emergency contact">
            {cust.emergency_contact_name ? (
              <>
                {cust.emergency_contact_name}
                {cust.emergency_contact_phone && (
                  <span className="ml-1 text-stone-500">· {cust.emergency_contact_phone}</span>
                )}
              </>
            ) : (
              <em className="text-stone-400">None on file</em>
            )}
          </Field>
        </div>
      </div>

      <ActionPanel
        booking={booking}
        dog={dog}
        cust={cust}
        isPaid={isPaid}
        isCheckedIn={isCheckedIn}
        isCheckedOut={isCheckedOut}
        ci={ci ?? null}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <div className="mt-0.5 text-sm text-stone-800">{children}</div>
    </div>
  );
}

async function ActionPanel({
  booking,
  dog,
  cust,
  isPaid,
  isCheckedIn,
  isCheckedOut,
  ci,
}: {
  booking: Booking;
  dog: Dog;
  cust: Profile;
  isPaid: boolean;
  isCheckedIn: boolean;
  isCheckedOut: boolean;
  ci: CheckIn | null;
}) {
  if (!isPaid) {
    return (
      <form action={kioskTakePayment}>
        <input type="hidden" name="booking_id" value={booking.id} />
        <BigButton tone="red">
          Take payment{" "}
          {booking.drop_in_price_cents
            ? `· ${formatMoney(booking.drop_in_price_cents)}`
            : ""}
        </BigButton>
      </form>
    );
  }
  if (isCheckedOut) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-stone-100 p-6 text-center text-stone-700">
        <p className="text-lg font-semibold">Already checked out</p>
        <p className="text-sm">
          {ci?.checked_out_at &&
            `at ${new Date(ci.checked_out_at).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}`}
        </p>
      </div>
    );
  }
  if (isCheckedIn) {
    return (
      <form action={kioskCheckOut}>
        <input type="hidden" name="booking_id" value={booking.id} />
        <BigButton tone="emerald">Check out</BigButton>
      </form>
    );
  }
  return (
    <form action={kioskCheckIn}>
      <input type="hidden" name="booking_id" value={booking.id} />
      <BigButton tone="amber">Check in</BigButton>
    </form>
  );
}

function BigButton({
  tone,
  children,
}: {
  tone: "amber" | "emerald" | "red";
  children: React.ReactNode;
}) {
  const toneStyles: Record<typeof tone, string> = {
    amber: "bg-amber-500 hover:bg-amber-600",
    emerald: "bg-emerald-600 hover:bg-emerald-700",
    red: "bg-red-600 hover:bg-red-700",
  };
  return (
    <button
      type="submit"
      className={`w-full rounded-2xl px-6 py-6 text-2xl font-bold text-white shadow-sm transition-colors ${toneStyles[tone]}`}
    >
      {children}
    </button>
  );
}


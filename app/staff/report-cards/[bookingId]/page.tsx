import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFullStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Booking,
  Dog,
  Profile,
  ReportCard,
  ReportCardPhoto,
} from "@/lib/supabase/types";
import { DogAvatar } from "@/components/DogAvatar";
import { formatDate, formatDateShort } from "@/lib/format";
import {
  saveReportCardNote,
  publishReportCard,
  unpublishReportCard,
} from "../actions";
import { ReportCardPhotosEditor } from "./PhotosEditor";

export default async function StaffReportCardEditorPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  await requireFullStaff();
  const { bookingId } = await params;
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle<Booking>();
  if (!booking) notFound();

  const [dogRes, custRes, cardRes] = await Promise.all([
    supabase
      .from("dogs")
      .select("*")
      .eq("id", booking.dog_id)
      .maybeSingle<Dog>(),
    supabase
      .from("profiles")
      .select("*")
      .eq("id", booking.customer_id)
      .maybeSingle<Profile>(),
    supabase
      .from("report_cards")
      .select("*")
      .eq("booking_id", bookingId)
      .maybeSingle<ReportCard>(),
  ]);
  const dog = dogRes.data;
  const cust = custRes.data;
  const card = cardRes.data;

  let photos: ReportCardPhoto[] = [];
  if (card) {
    const { data } = await supabase
      .from("report_card_photos")
      .select("*")
      .eq("report_card_id", card.id)
      .order("sort_order")
      .order("uploaded_at");
    photos = (data ?? []) as ReportCardPhoto[];
  }

  const dateLabel =
    booking.service_kind === "boarding"
      ? `${formatDateShort(booking.service_date)} → ${formatDateShort(booking.service_end_date)}`
      : formatDateShort(booking.service_date);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/staff/report-cards"
          className="text-sm text-ink-500 hover:text-ink-900"
        >
          ← All report cards
        </Link>
      </div>

      <header className="flex flex-wrap items-center gap-4">
        <DogAvatar
          photoPath={dog?.photo_path ?? null}
          name={dog?.name ?? "Dog"}
          size={72}
        />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink-900">
            {dog?.name ?? "Dog"}&apos;s report card
          </h1>
          <p className="text-ink-700">
            {dateLabel} ·{" "}
            {booking.service_kind === "boarding" ? "Boarding" : "Daycare"}
            {cust && (
              <>
                {" · "}for{" "}
                <Link
                  href={`/staff/customers/${cust.id}`}
                  className="text-brand-700 hover:underline"
                >
                  {cust.full_name || cust.email}
                </Link>
              </>
            )}
          </p>
          {card?.published_at ? (
            <p className="mt-1 text-xs font-medium text-emerald-700">
              Published {formatDate(card.published_at)} — visible to{" "}
              {cust?.full_name?.split(" ")[0] ?? "the customer"}.
            </p>
          ) : (
            <p className="mt-1 text-xs text-ink-500">
              Draft — not visible to the customer yet.
            </p>
          )}
        </div>
      </header>

      <section className="card">
        <h2 className="font-semibold text-ink-900">Note from us</h2>
        <p className="mt-1 text-xs text-ink-500">
          A short, warm message about how {dog?.name ?? "the pup"} did. This is
          what the customer reads first.
        </p>
        <form action={saveReportCardNote} className="mt-3 space-y-3">
          <input type="hidden" name="booking_id" value={booking.id} />
          <textarea
            name="note"
            rows={5}
            defaultValue={card?.note ?? ""}
            className="input"
            placeholder={`e.g. "${dog?.name ?? "Buddy"} had the best day! Made fast friends with a goldendoodle and absolutely demolished her lunch. Nap of champions at 1pm. 🐾"`}
          />
          <div className="flex justify-end">
            <button type="submit" className="btn-primary">
              Save note
            </button>
          </div>
        </form>
      </section>

      <ReportCardPhotosEditor bookingId={booking.id} photos={photos} />

      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink-900">
            {card?.published_at ? "Re-share with customer" : "Send to customer"}
          </h2>
          <p className="mt-1 text-sm text-ink-700">
            {card?.published_at
              ? "Updating won't re-send the email — only the first publish notifies them."
              : "Publishing makes the card visible on the customer's account and sends them an email."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {card?.published_at && (
            <form action={unpublishReportCard}>
              <input type="hidden" name="booking_id" value={booking.id} />
              <button
                type="submit"
                className="btn-secondary"
                formNoValidate
              >
                Unpublish
              </button>
            </form>
          )}
          <form action={publishReportCard}>
            <input type="hidden" name="booking_id" value={booking.id} />
            <button type="submit" className="btn-primary">
              {card?.published_at ? "Update published card" : "Publish & email"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

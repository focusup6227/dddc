import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireFullStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayISO } from "@/lib/format";
import type { Dog, Profile } from "@/lib/supabase/types";
import { createStaffBooking } from "../../actions";
import { StaffBookingForm } from "./StaffBookingForm";

export const dynamic = "force-dynamic";

export default async function StaffBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dog?: string }>;
}) {
  await requireFullStaff();
  const { id } = await params;
  const { dog: preselectDog } = await searchParams;
  const supabase = await createClient();

  const [{ data: customer }, { data: dogData }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", id)
      .maybeSingle<Pick<Profile, "id" | "full_name" | "email">>(),
    supabase
      .from("dogs")
      .select("id, name")
      .eq("owner_id", id)
      .eq("active", true)
      .order("name"),
  ]);
  if (!customer) notFound();

  const dogs = (dogData ?? []) as Pick<Dog, "id" | "name">[];
  const tomorrow = addDays(todayISO(), 1);

  return (
    <div className="animate-fade-up">
      <Link
        href={`/staff/customers/${id}`}
        className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft size={16} /> {customer.full_name || customer.email}
      </Link>

      <h1 className="mt-3 font-display text-3xl font-bold text-ink-900">
        New booking
      </h1>
      <p className="mt-1 text-sm text-ink-500">
        Payment is collected at drop-off — this is recorded as unpaid until then.
      </p>

      {dogs.length === 0 ? (
        <div className="card mt-6">
          <p className="text-sm text-ink-700">
            This customer has no dogs on file yet.{" "}
            <Link
              href={`/staff/customers/${id}/dogs/new`}
              className="font-medium text-brand-700 underline"
            >
              Add a dog
            </Link>{" "}
            first.
          </p>
        </div>
      ) : (
        <StaffBookingForm
          action={createStaffBooking}
          customerId={id}
          dogs={dogs}
          preselectDog={preselectDog}
          tomorrow={tomorrow}
        />
      )}
    </div>
  );
}

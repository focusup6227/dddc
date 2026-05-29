import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireFullStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";
import { addDogForCustomer } from "../../../actions";

export const dynamic = "force-dynamic";

const GETS_ALONG_OPTIONS = [
  "Small dogs",
  "Big dogs",
  "Male dogs",
  "Female dogs",
  "All dogs",
  "I'm not sure",
];

export default async function StaffNewDogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireFullStaff();
  const { id } = await params;
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", id)
    .maybeSingle<Pick<Profile, "id" | "full_name" | "email">>();
  if (!customer) notFound();

  return (
    <div className="animate-fade-up">
      <Link
        href={`/staff/customers/${id}`}
        className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft size={16} /> {customer.full_name || customer.email}
      </Link>

      <h1 className="mt-3 font-display text-3xl font-bold text-ink-900">
        Add a dog
      </h1>

      <form action={addDogForCustomer} className="mt-6 space-y-6">
        <input type="hidden" name="owner_id" value={id} />

        <section className="card space-y-4">
          <h3 className="font-display text-lg font-semibold text-ink-900">
            Basics
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field name="name" label="Name" required />
            <Field name="breed" label="Breed" />
            <div>
              <label className="label">Sex</label>
              <select name="sex" defaultValue="" className="input">
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <Field name="weight_lbs" label="Weight (lbs)" type="number" step="0.1" />
            <Field name="date_of_birth" label="Date of birth" type="date" />
            <Field name="color" label="Color" />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              name="spayed_neutered"
              value="yes"
              className="h-4 w-4 rounded border-stone-300"
            />
            Spayed / neutered
          </label>
        </section>

        <section className="card space-y-4">
          <h3 className="font-display text-lg font-semibold text-ink-900">
            Health &amp; vet
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field name="vet_name" label="Vet name" />
            <Field name="vet_phone" label="Vet phone" />
          </div>
          <Textarea
            name="health_issues"
            label="Does the dog have any health issues we should be aware of?"
          />
          <Textarea name="medications" label="Does the dog take any medications?" />
        </section>

        <section className="card space-y-4">
          <h3 className="font-display text-lg font-semibold text-ink-900">
            Socialization
          </h3>
          <fieldset>
            <legend className="label">This dog gets along best with</legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {GETS_ALONG_OPTIONS.map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 text-sm text-ink-700"
                >
                  <input
                    type="checkbox"
                    name="gets_along_with"
                    value={option}
                    className="h-4 w-4 rounded border-stone-300"
                  />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="card space-y-4">
          <h3 className="font-display text-lg font-semibold text-ink-900">
            Care notes
          </h3>
          <Textarea name="feeding_notes" label="Feeding instructions" />
          <Textarea name="behavior_notes" label="Behavior / personality" />
          <Textarea
            name="additional_notes"
            label="Anything else we should know?"
            rows={6}
          />
        </section>

        <div className="flex justify-end gap-3">
          <Link href={`/staff/customers/${id}`} className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn-primary">
            Add dog
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  step,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  step?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        step={step}
        required={required}
        className="input"
      />
    </div>
  );
}

function Textarea({
  name,
  label,
  rows = 3,
}: {
  name: string;
  label: string;
  rows?: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <textarea id={name} name={name} rows={rows} className="input" />
    </div>
  );
}

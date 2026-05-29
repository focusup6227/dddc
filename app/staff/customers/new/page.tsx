import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireFullStaff } from "@/lib/auth";
import { createCustomer } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  await requireFullStaff();

  return (
    <div className="animate-fade-up">
      <Link
        href="/staff/customers"
        className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft size={16} /> Customers
      </Link>

      <h1 className="mt-3 font-display text-3xl font-bold text-ink-900">
        New customer
      </h1>
      <p className="mt-1 text-sm text-ink-500">
        Create an account for a walk-in or phone customer. They&rsquo;ll get a
        real login they can set up later.
      </p>

      <form action={createCustomer} className="mt-6 space-y-6">
        <section className="card space-y-4">
          <h3 className="font-display text-lg font-semibold text-ink-900">
            Contact
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field name="full_name" label="Full name" required />
            <Field name="email" label="Email" type="email" required />
            <Field name="phone" label="Phone" type="tel" />
            <Field name="address" label="Address" />
          </div>
        </section>

        <section className="card space-y-4">
          <h3 className="font-display text-lg font-semibold text-ink-900">
            Emergency contact
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field name="emergency_contact_name" label="Name" />
            <Field name="emergency_contact_phone" label="Phone" type="tel" />
          </div>
        </section>

        <section className="card">
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              name="send_invite"
              value="yes"
              defaultChecked
              className="h-4 w-4 rounded border-stone-300"
            />
            Email them a link to set their password
          </label>
        </section>

        <div className="flex justify-end gap-3">
          <Link href="/staff/customers" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn-primary">
            Create customer
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
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
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
        required={required}
        className="input"
      />
    </div>
  );
}

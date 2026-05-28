import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

export default async function StaffCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireStaff();
  const supabase = await createClient();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";

  let query = supabase
    .from("profiles")
    .select("*")
    .eq("role", "customer")
    .order("full_name");
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  const { data } = await query.limit(200);
  const customers = (data ?? []) as Profile[];

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold text-stone-900">Customers</h1>
        <form className="flex w-full items-end gap-2 sm:w-auto">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name, email, phone"
            className="input flex-1 sm:w-64"
          />
          <button type="submit" className="btn-secondary shrink-0">Search</button>
        </form>
      </header>

      <ul className="mt-6 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
        {customers.map((c) => (
          <li key={c.id}>
            <Link
              href={`/staff/customers/${c.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-stone-50"
            >
              <div>
                <p className="font-medium text-stone-900">{c.full_name || "(no name)"}</p>
                <p className="text-sm text-stone-500">
                  {c.email}
                  {c.phone ? ` · ${c.phone}` : ""}
                </p>
              </div>
              <span className="text-sm text-stone-400">→</span>
            </Link>
          </li>
        ))}
        {customers.length === 0 && (
          <li className="px-4 py-6 text-center text-stone-500">No customers found.</li>
        )}
      </ul>
    </div>
  );
}

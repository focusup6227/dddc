import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
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
  if (q)
    query = query.or(
      `full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`,
    );
  const { data } = await query.limit(200);
  const customers = (data ?? []) as Profile[];

  return (
    <div className="animate-fade-up">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">
            Customers
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {customers.length} {customers.length === 1 ? "person" : "people"} on file.
          </p>
        </div>
        <form className="flex w-full items-end gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-400">
              <Search size={16} />
            </span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search name, email, phone"
              className="input pl-9"
            />
          </div>
          <button type="submit" className="btn-secondary shrink-0">
            Search
          </button>
        </form>
      </header>

      <ul className="mt-6 divide-y divide-stone-200/80 rounded-2xl border border-stone-200/80 bg-white shadow-soft">
        {customers.map((c) => (
          <li key={c.id}>
            <Link
              href={`/staff/customers/${c.id}`}
              className="group flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-cream-50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink-900">
                  {c.full_name || "(no name)"}
                </p>
                <p className="truncate text-sm text-ink-500">
                  {c.email}
                  {c.phone ? ` · ${c.phone}` : ""}
                </p>
              </div>
              <ChevronRight
                size={18}
                className="shrink-0 text-ink-400 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
        {customers.length === 0 && (
          <li className="px-5 py-8 text-center text-sm text-ink-500">
            No customers found.
          </li>
        )}
      </ul>
    </div>
  );
}

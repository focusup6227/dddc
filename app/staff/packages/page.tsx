import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Package } from "@/lib/supabase/types";
import { formatMoney } from "@/lib/format";
import { StaffSubNav } from "@/components/StaffSubNav";
import { savePackage, togglePackage } from "./actions";

const SUBNAV = [
  { href: "/staff/settings", label: "General" },
  { href: "/staff/packages", label: "Packages", active: true },
  { href: "/staff/events", label: "Events" },
];

export default async function StaffPackagesPage() {
  await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase.from("packages").select("*").order("sort_order");
  const packages = (data ?? []) as Package[];

  return (
    <div className="space-y-8">
      <StaffSubNav items={SUBNAV} />
      <h1 className="text-2xl font-bold text-stone-900">Packages</h1>

      <section className="card">
        <h2 className="font-semibold text-stone-900">Add a package</h2>
        <form action={savePackage} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input name="name" required placeholder="e.g. 5-Day Pack" className="input" />
          <input name="description" placeholder="Description (optional)" className="input" />
          <input
            name="days_included"
            type="number"
            min="1"
            required
            placeholder="Days"
            className="input"
          />
          <input
            name="price_cents"
            type="number"
            min="0"
            required
            placeholder="Price (cents)"
            className="input"
          />
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" className="btn-primary">Create</button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-stone-900">All packages</h2>
        <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {packages.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-stone-900">
                  {p.name}{" "}
                  {!p.active && <span className="text-xs text-stone-400">(inactive)</span>}
                </p>
                <p className="text-sm text-stone-500">
                  {p.days_included} days · {formatMoney(p.price_cents)}
                </p>
              </div>
              <form action={togglePackage}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="active" value={p.active ? "false" : "true"} />
                <button type="submit" className="btn-secondary text-sm">
                  {p.active ? "Disable" : "Enable"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

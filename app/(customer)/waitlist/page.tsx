import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Dog, WaitlistEntry } from "@/lib/supabase/types";
import { formatDateShort } from "@/lib/format";
import { leaveWaitlist } from "./actions";

export default async function WaitlistPage() {
  const { userId } = await requireCustomer();
  const supabase = await createClient();

  const [entriesRes, dogsRes] = await Promise.all([
    supabase
      .from("waitlist_entries")
      .select("*")
      .eq("customer_id", userId)
      .in("status", ["pending", "notified"])
      .order("service_date"),
    supabase.from("dogs").select("*").eq("owner_id", userId),
  ]);
  const entries = (entriesRes.data ?? []) as WaitlistEntry[];
  const dogs = (dogsRes.data ?? []) as Dog[];
  const dogById = new Map(dogs.map((d) => [d.id, d]));

  return (
    <div className="max-w-2xl space-y-6 animate-fade-up">
      <header>
        <h1 className="font-display text-3xl font-bold text-ink-900">Waitlist</h1>
        <p className="mt-1 text-sm text-ink-500">
          We&apos;ll email and push when a slot opens up.
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="card text-sm text-ink-500">
          You aren&apos;t on the waitlist for any days.{" "}
          <Link href="/book" className="font-semibold text-brand-700 hover:underline">
            Try booking →
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-stone-200/80 rounded-2xl border border-stone-200/80 bg-white shadow-soft">
          {entries.map((e) => {
            const dog = dogById.get(e.dog_id);
            return (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">
                    {formatDateShort(e.service_date)} — {dog?.name ?? "Dog"}
                  </p>
                  <p className="text-sm text-ink-500">
                    {e.service_kind === "boarding" ? "Boarding" : "Day care"}
                    {" · "}
                    {e.status === "notified" ? (
                      <span className="font-semibold text-emerald-700">
                        Spot opened — book now!
                      </span>
                    ) : (
                      "Waiting"
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  {e.status === "notified" && (
                    <Link
                      href={e.service_kind === "boarding" ? "/board" : "/book"}
                      className="btn-primary text-sm"
                    >
                      Book it
                    </Link>
                  )}
                  <form action={leaveWaitlist}>
                    <input type="hidden" name="id" value={e.id} />
                    <button
                      type="submit"
                      className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
                    >
                      Leave
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

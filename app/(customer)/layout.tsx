import Image from "next/image";
import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { MobileNav } from "@/components/MobileNav";

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, profile } = await requireCustomer();
  const supabase = await createClient();

  const { count: signedCount } = await supabase
    .from("waiver_signatures")
    .select("waiver_id, waivers!inner(active)", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("waivers.active", true);

  const waiverSigned = (signedCount ?? 0) > 0;

  const nav = [
    { href: "/dashboard", label: "Home" },
    { href: "/dogs", label: "My Dogs" },
    { href: "/book", label: "Book" },
    { href: "/packages", label: "Packages" },
    { href: "/bookings", label: "Bookings" },
    { href: "/account", label: "Account" },
  ];

  return (
    <div className="relative min-h-screen bg-cream-50 bg-paw-pattern">
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-cream-50/85 backdrop-blur supports-[backdrop-filter]:bg-cream-50/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Link
            href="/dashboard"
            className="flex min-w-0 items-center gap-2.5 text-ink-900 hover:text-brand-700 transition-colors"
          >
            <span className="relative inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-2xl ring-1 ring-brand-200/60 shadow-soft">
              <Image
                src="/logo.jpg"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 object-cover"
              />
            </span>
            <span className="hidden truncate font-display text-lg font-bold sm:inline">
              Dixon Doggy Day Care
            </span>
            <span className="truncate font-display text-base font-bold sm:hidden">
              DDDC
            </span>
          </Link>
          <nav className="hidden gap-1 md:flex">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-xl px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-cream-100 hover:text-ink-900 transition-colors"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-ink-700 sm:inline">
              {profile.full_name || profile.email}
            </span>
            <SignOutButton />
            <MobileNav
              items={nav}
              trailing={
                <span className="block text-sm text-ink-700">
                  {profile.full_name || profile.email}
                </span>
              }
            />
          </div>
        </div>
        {!waiverSigned && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 sm:px-6">
            Please{" "}
            <Link href="/waiver" className="font-semibold underline">
              sign the liability waiver
            </Link>{" "}
            before booking.
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 animate-fade-in">
        {children}
      </main>
    </div>
  );
}

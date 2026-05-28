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

  // Has the user signed the active waiver?
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
    <div className="min-h-screen bg-stone-50">
      <header className="relative border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2 text-brand-700">
            <Image
              src="/logo.jpg"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-full"
            />
            <span className="hidden truncate text-lg font-bold sm:inline">
              Dixon Doggy Day Care and Boarding
            </span>
            <span className="truncate text-base font-bold sm:hidden">DDDC</span>
          </Link>
          <nav className="hidden gap-1 md:flex">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="btn-ghost">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-stone-600 sm:inline">
              {profile.full_name || profile.email}
            </span>
            <SignOutButton />
            <MobileNav
              items={nav}
              trailing={
                <span className="block text-sm text-stone-600">
                  {profile.full_name || profile.email}
                </span>
              }
            />
          </div>
        </div>
        {!waiverSigned && (
          <div className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 sm:px-6">
            Please{" "}
            <Link href="/waiver" className="font-semibold underline">
              sign the liability waiver
            </Link>{" "}
            before booking.
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

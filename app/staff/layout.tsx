import Image from "next/image";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { getPendingVaccineCount } from "@/lib/vaccines.server";

const NAV: { href: string; label: string; badgeKey?: "vaccines" }[] = [
  { href: "/staff", label: "Today" },
  { href: "/staff/bookings", label: "Bookings" },
  { href: "/staff/customers", label: "Customers" },
  { href: "/staff/dogs", label: "Dogs" },
  { href: "/staff/vaccines", label: "Vaccines", badgeKey: "vaccines" },
  { href: "/staff/report-cards", label: "Report cards" },
  { href: "/staff/packages", label: "Packages" },
  { href: "/staff/settings", label: "Settings" },
  { href: "/kiosk", label: "Kiosk" },
];

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionProfile();
  const isStaff = session?.profile.role === "staff";
  const pendingVaccines = isStaff ? await getPendingVaccineCount() : 0;

  // Login page lives at /staff/login. Don't gate the whole tree —
  // pages call requireStaff() themselves so the login page can render.

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-stone-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/staff" className="flex items-center gap-2">
            <Image
              src="/logo.jpg"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-full ring-2 ring-stone-700"
            />
            <span className="text-lg font-bold">
              <span className="hidden sm:inline">Dixon Doggy Day Care</span>
              <span className="sm:hidden">DDDC</span>
              {" · Operator"}
            </span>
          </Link>
          {isStaff && (
            <>
              <nav className="hidden gap-1 md:flex">
                {NAV.map((n) => {
                  const count = n.badgeKey === "vaccines" ? pendingVaccines : 0;
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      className="relative rounded-md px-3 py-1.5 text-sm text-stone-200 hover:bg-stone-800 hover:text-white"
                    >
                      {n.label}
                      {count > 0 && (
                        <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-semibold text-stone-900">
                          {count}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
              <div className="flex items-center gap-3">
                <span className="hidden text-sm text-stone-300 sm:inline">
                  {session.profile.full_name || session.profile.email}
                </span>
                <SignOutButton className="rounded-md px-3 py-1.5 text-sm text-stone-200 hover:bg-stone-800" />
              </div>
            </>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}

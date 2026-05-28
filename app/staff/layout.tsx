import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

const NAV = [
  { href: "/staff", label: "Today" },
  { href: "/staff/bookings", label: "Bookings" },
  { href: "/staff/customers", label: "Customers" },
  { href: "/staff/dogs", label: "Dogs" },
  { href: "/staff/packages", label: "Packages" },
];

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionProfile();

  // Login page lives at /staff/login. Don't gate the whole tree —
  // pages call requireStaff() themselves so the login page can render.

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-stone-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/staff" className="text-lg font-bold">
            DDDC · Operator
          </Link>
          {session?.profile.role === "staff" && (
            <>
              <nav className="hidden gap-1 md:flex">
                {NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="rounded-md px-3 py-1.5 text-sm text-stone-200 hover:bg-stone-800 hover:text-white"
                  >
                    {n.label}
                  </Link>
                ))}
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

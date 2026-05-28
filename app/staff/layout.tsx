import Image from "next/image";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { getPendingVaccineCount } from "@/lib/vaccines.server";
import { MobileNav } from "@/components/MobileNav";

type NavItem = {
  href: string;
  label: string;
  badgeKey?: "vaccines";
  juniorAllowed?: boolean;
};

const NAV: NavItem[] = [
  { href: "/staff", label: "Today", juniorAllowed: true },
  { href: "/staff/calendar", label: "Schedule", juniorAllowed: true },
  { href: "/staff/customers", label: "Customers" },
  {
    href: "/staff/dogs",
    label: "Dogs",
    badgeKey: "vaccines",
    juniorAllowed: true,
  },
  { href: "/staff/chores", label: "Chores", juniorAllowed: true },
  { href: "/staff/report-cards", label: "Report cards" },
  { href: "/staff/settings", label: "Settings" },
  { href: "/kiosk", label: "Kiosk" },
];

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionProfile();
  const isStaff =
    session?.profile.role === "staff" ||
    session?.profile.role === "junior_staff";
  const isJunior = session?.profile.role === "junior_staff";
  // Only full staff sees the pending-vaccine badge; junior can't action it.
  const pendingVaccines =
    isStaff && !isJunior ? await getPendingVaccineCount() : 0;

  const visibleNav = NAV.filter((n) => (isJunior ? n.juniorAllowed : true));
  const navWithBadges = visibleNav.map((n) => ({
    href: n.href,
    label: n.label,
    badge: n.badgeKey === "vaccines" ? pendingVaccines : undefined,
  }));

  return (
    <div className="min-h-screen bg-cream-50 bg-paw-pattern">
      <header className="sticky top-0 z-40 border-b border-ink-900/30 bg-ink-900 text-white shadow-lg shadow-ink-900/20">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Link
            href="/staff"
            className="flex min-w-0 items-center gap-2.5 group"
          >
            <span className="relative inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-2xl ring-1 ring-brand-400/50 shadow-glow transition-transform group-hover:scale-105">
              <Image
                src="/logo.jpg"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 object-cover"
              />
            </span>
            <span className="truncate font-display text-base font-bold sm:text-lg">
              <span className="hidden sm:inline">Dixon Doggy Day Care</span>
              <span className="sm:hidden">DDDC</span>
            </span>
            <span className="hidden rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-300 sm:inline">
              {isJunior ? "Junior" : "Operator"}
            </span>
          </Link>
          {isStaff && (
            <>
              <nav className="hidden gap-0.5 md:flex">
                {visibleNav.map((n) => {
                  const count = n.badgeKey === "vaccines" ? pendingVaccines : 0;
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      className="relative rounded-xl px-2.5 py-1.5 text-sm font-medium text-ink-400 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      {n.label}
                      {count > 0 && (
                        <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                          {count}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
              <div className="flex items-center gap-2">
                <span className="hidden text-sm text-ink-400 xl:inline">
                  {session.profile.full_name || session.profile.email}
                </span>
                <SignOutButton className="rounded-xl px-3 py-1.5 text-sm font-medium text-ink-400 hover:bg-white/5 hover:text-white" />
                <MobileNav
                  items={navWithBadges}
                  variant="dark"
                  trailing={
                    <span className="block text-sm text-ink-400">
                      {session.profile.full_name || session.profile.email}
                    </span>
                  }
                />
              </div>
            </>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 animate-fade-in">
        {children}
      </main>
    </div>
  );
}

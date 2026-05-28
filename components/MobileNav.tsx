"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

export type MobileNavItem = {
  href: string;
  label: string;
  badge?: number;
};

export function MobileNav({
  items,
  variant = "light",
  trailing,
}: {
  items: MobileNavItem[];
  variant?: "light" | "dark";
  trailing?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const buttonStyle =
    variant === "dark"
      ? "text-stone-200 hover:bg-white/5 hover:text-white"
      : "text-ink-700 hover:bg-cream-100";

  const panelStyle =
    variant === "dark"
      ? "bg-ink-900 text-stone-100 border-ink-900/40"
      : "bg-white text-ink-900 border-stone-200/80";

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${buttonStyle}`}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {open && (
        <div
          className={`absolute inset-x-0 top-full z-40 border-t shadow-lift ${panelStyle} animate-fade-in`}
        >
          <nav className="flex flex-col gap-0.5 px-3 py-3">
            {items.map((n) => {
              const active = pathname === n.href;
              const activeStyle =
                variant === "dark"
                  ? active
                    ? "bg-white/10 text-white"
                    : "text-stone-200 hover:bg-white/5 hover:text-white"
                  : active
                    ? "bg-cream-100 text-ink-900"
                    : "text-ink-700 hover:bg-cream-100";
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex items-center justify-between rounded-xl px-3 py-3 text-base font-medium transition-colors ${activeStyle}`}
                >
                  <span>{n.label}</span>
                  {n.badge && n.badge > 0 ? (
                    <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-brand-500 px-2 py-0.5 text-xs font-semibold text-white">
                      {n.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            {trailing && (
              <div className="mt-1 border-t border-current/10 px-3 py-3">
                {trailing}
              </div>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}

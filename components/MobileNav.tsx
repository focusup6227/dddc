"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
      ? "text-stone-200 hover:bg-stone-800 hover:text-white"
      : "text-stone-700 hover:bg-stone-100";

  const panelStyle =
    variant === "dark"
      ? "bg-stone-900 text-stone-100 border-stone-800"
      : "bg-white text-stone-900 border-stone-200";

  const linkStyle =
    variant === "dark"
      ? "text-stone-200 hover:bg-stone-800 hover:text-white"
      : "text-stone-700 hover:bg-stone-100";

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-10 w-10 items-center justify-center rounded-md ${buttonStyle}`}
      >
        {open ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M3 5.75A.75.75 0 0 1 3.75 5h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 5.75ZM3 10a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 10Zm0 4.25a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 14.25Z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>

      {open && (
        <div
          className={`absolute inset-x-0 top-full z-40 border-t shadow-lg ${panelStyle}`}
        >
          <nav className="flex flex-col px-3 py-2">
            {items.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex items-center justify-between rounded-md px-3 py-3 text-base font-medium ${linkStyle} ${
                    active
                      ? variant === "dark"
                        ? "bg-stone-800 text-white"
                        : "bg-stone-100 text-stone-900"
                      : ""
                  }`}
                >
                  <span>{n.label}</span>
                  {n.badge && n.badge > 0 ? (
                    <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-stone-900">
                      {n.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            {trailing && <div className="mt-1 border-t border-current/10 px-3 py-3">{trailing}</div>}
          </nav>
        </div>
      )}
    </div>
  );
}

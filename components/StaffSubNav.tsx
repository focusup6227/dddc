import Link from "next/link";

export type StaffSubNavItem = {
  href: string;
  label: string;
  active?: boolean;
  badge?: number;
};

export function StaffSubNav({ items }: { items: StaffSubNavItem[] }) {
  return (
    <nav className="-mt-2 flex flex-wrap gap-1 rounded-2xl border border-stone-200/80 bg-white p-1 shadow-soft">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={
            item.active
              ? "relative inline-flex items-center gap-1.5 rounded-xl bg-ink-900 px-3.5 py-1.5 text-sm font-semibold text-white shadow-soft"
              : "relative inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-medium text-ink-700 hover:bg-cream-100 hover:text-ink-900 transition-colors"
          }
        >
          {item.label}
          {item.badge != null && item.badge > 0 && (
            <span
              className={
                "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold " +
                (item.active
                  ? "bg-brand-400 text-ink-900"
                  : "bg-brand-500 text-white")
              }
            >
              {item.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

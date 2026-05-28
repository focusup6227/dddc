import Link from "next/link";

export type StaffSubNavItem = {
  href: string;
  label: string;
  active?: boolean;
  badge?: number;
};

export function StaffSubNav({ items }: { items: StaffSubNavItem[] }) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-stone-200 pb-2 -mt-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={
            item.active
              ? "relative rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white"
              : "relative rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900"
          }
        >
          {item.label}
          {item.badge != null && item.badge > 0 && (
            <span
              className={
                "ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold " +
                (item.active
                  ? "bg-amber-300 text-stone-900"
                  : "bg-amber-500 text-stone-900")
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

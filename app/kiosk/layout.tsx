import Link from "next/link";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function KioskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStaff();
  return (
    <div className="min-h-screen bg-cream-50 bg-paw-pattern text-ink-900">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200/80 bg-cream-50/85 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-cream-50/70">
        <Link href="/kiosk" className="flex items-center gap-2.5 group">
          <span className="relative inline-flex h-11 w-11 overflow-hidden rounded-2xl ring-1 ring-brand-200/60 shadow-soft transition-transform group-hover:scale-105">
            <Image
              src="/logo.jpg"
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 object-cover"
            />
          </span>
          <span className="font-display text-lg font-bold text-ink-900">
            DDDC
          </span>
          <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700">
            Kiosk
          </span>
        </Link>
        <Link
          href="/staff"
          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-sm font-semibold text-ink-700 hover:bg-cream-50 hover:border-stone-300"
        >
          <LogOut size={14} /> Exit kiosk
        </Link>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 animate-fade-in">
        {children}
      </main>
    </div>
  );
}

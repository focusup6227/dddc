import Link from "next/link";
import Image from "next/image";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function KioskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStaff();
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-3">
        <Link href="/kiosk" className="flex items-center gap-2">
          <Image
            src="/logo.jpg"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-full"
          />
          <span className="text-base font-bold text-stone-900">
            DDDC <span className="text-stone-400">·</span> Kiosk
          </span>
        </Link>
        <Link
          href="/staff"
          className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          Exit kiosk
        </Link>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}

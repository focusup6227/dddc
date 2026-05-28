import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { MascotFace } from "@/components/illustrations";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const session = await getSessionProfile();
  if (session) {
    const isStaff =
      session.profile.role === "staff" ||
      session.profile.role === "junior_staff";
    redirect(isStaff ? "/staff" : "/dashboard");
  }
  const params = await searchParams;

  return (
    <div className="relative min-h-screen overflow-hidden bg-cream-50 bg-paw-pattern">
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-amber-200/40 blur-3xl" />

      <main className="relative mx-auto flex max-w-md flex-col px-6 py-12 animate-fade-up">
        <Link
          href="/"
          className="mx-auto flex items-center gap-2.5 text-ink-900"
        >
          <span className="relative inline-flex h-12 w-12 overflow-hidden rounded-2xl ring-1 ring-brand-200/60 shadow-soft">
            <Image
              src="/logo.jpg"
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 object-cover"
            />
          </span>
          <span className="font-display text-lg font-bold">
            Dixon Doggy Day Care
          </span>
        </Link>

        <div className="mt-10 flex justify-center">
          <span className="h-24 w-24 text-brand-400">
            <MascotFace className="h-full w-full" />
          </span>
        </div>

        <h1 className="mt-4 text-center font-display text-3xl font-bold text-ink-900">
          Welcome back
        </h1>
        <p className="mt-1 text-center text-sm text-ink-500">
          Sign in to manage bookings and your dog&apos;s profile.
        </p>

        <form
          action={login}
          className="mt-8 space-y-4 rounded-3xl border border-stone-200/80 bg-white p-6 shadow-lift sm:p-8"
        >
          {params.next && <input type="hidden" name="next" value={params.next} />}
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="input"
            />
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
            />
          </div>
          {params.error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {params.error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full">
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-700">
          No account?{" "}
          <Link
            href="/signup"
            className="font-semibold text-brand-700 hover:text-brand-800 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </main>
    </div>
  );
}

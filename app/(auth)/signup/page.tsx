import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Gift } from "lucide-react";
import { getSessionProfile } from "@/lib/auth";
import { MascotFace } from "@/components/illustrations";
import { signup } from "./actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ref?: string }>;
}) {
  const session = await getSessionProfile();
  if (session) {
    redirect(session.profile.role === "staff" ? "/staff" : "/dashboard");
  }
  const params = await searchParams;
  const refCode = params.ref?.trim().toUpperCase() ?? "";

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
          Create your account
        </h1>
        <p className="mt-1 text-center text-sm text-ink-500">
          Tell us a bit about you. You&apos;ll add your dog(s) on the next step.
        </p>

        {refCode && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900 shadow-soft">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Gift size={16} />
            </span>
            <div>
              <p className="font-semibold">$10 off your first booking</p>
              <p className="text-xs text-emerald-800">
                Code <code className="font-mono">{refCode}</code> will be
                applied after signup.
              </p>
            </div>
          </div>
        )}

        <form
          action={signup}
          className="mt-6 space-y-4 rounded-3xl border border-stone-200/80 bg-white p-6 shadow-lift sm:p-8"
        >
          {refCode && <input type="hidden" name="ref" value={refCode} />}
          <div>
            <label htmlFor="full_name" className="label">Full name</label>
            <input
              id="full_name"
              name="full_name"
              autoComplete="name"
              required
              className="input"
            />
          </div>
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
            <label htmlFor="phone" className="label">Phone</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
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
              autoComplete="new-password"
              required
              minLength={8}
              className="input"
            />
            <p className="mt-1.5 text-xs text-ink-500">At least 8 characters.</p>
          </div>
          {params.error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {params.error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full">
            Create account
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-700">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-brand-700 hover:text-brand-800 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { signup } from "./actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSessionProfile();
  if (session) {
    redirect(session.profile.role === "staff" ? "/staff" : "/dashboard");
  }
  const params = await searchParams;

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-bold text-stone-900">Create your account</h1>
      <p className="mt-1 text-sm text-stone-600">
        Tell us a bit about you. You&apos;ll add your dog(s) on the next step.
      </p>

      <form action={signup} className="mt-8 space-y-4">
        <div>
          <label htmlFor="full_name" className="label">Full name</label>
          <input id="full_name" name="full_name" required className="input" />
        </div>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" required className="input" />
        </div>
        <div>
          <label htmlFor="phone" className="label">Phone</label>
          <input id="phone" name="phone" type="tel" required className="input" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            className="input"
          />
          <p className="mt-1 text-xs text-stone-500">At least 8 characters.</p>
        </div>
        {params.error && (
          <p className="text-sm text-red-600">{params.error}</p>
        )}
        <button type="submit" className="btn-primary w-full">
          Create account
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-stone-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Sign in
        </Link>
      </p>
    </main>
  );
}

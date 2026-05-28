import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const session = await getSessionProfile();
  if (session) {
    redirect(session.profile.role === "staff" ? "/staff" : "/dashboard");
  }
  const params = await searchParams;

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-bold text-stone-900">Welcome back</h1>
      <p className="mt-1 text-sm text-stone-600">
        Sign in to manage bookings and your dog&apos;s profile.
      </p>

      <form action={login} className="mt-8 space-y-4">
        {params.next && <input type="hidden" name="next" value={params.next} />}
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" required className="input" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" name="password" type="password" required className="input" />
        </div>
        {params.error && (
          <p className="text-sm text-red-600">{params.error}</p>
        )}
        <button type="submit" className="btn-primary w-full">
          Sign in
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-stone-600">
        No account?{" "}
        <Link href="/signup" className="font-medium text-brand-600 hover:text-brand-700">
          Sign up
        </Link>
      </p>
    </main>
  );
}

import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { staffLogin } from "./actions";

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSessionProfile();
  if (
    session?.profile.role === "staff" ||
    session?.profile.role === "junior_staff"
  ) {
    redirect("/staff");
  }
  const params = await searchParams;

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-bold text-ink-900">Operator sign in</h1>
      <p className="mt-1 text-sm text-ink-700">For Dixon Doggy Day Care and Boarding staff.</p>

      <form action={staffLogin} className="mt-8 space-y-4">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" required className="input" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" name="password" type="password" required className="input" />
        </div>
        {params.error && <p className="text-sm text-red-600">{params.error}</p>}
        <button type="submit" className="btn-primary w-full">Sign in</button>
      </form>

      <p className="mt-6 text-xs text-ink-500">
        Staff accounts are provisioned by an admin. See the README for how to flip an
        account to staff in Supabase.
      </p>
    </main>
  );
}

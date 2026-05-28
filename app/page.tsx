import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="text-center">
        <Image
          src="/logo.jpg"
          alt="Dixon Doggy Day Care and Boarding"
          width={240}
          height={240}
          priority
          className="mx-auto h-44 w-44 rounded-full shadow-md sm:h-56 sm:w-56"
        />
        <p className="mt-6 text-sm font-semibold uppercase tracking-wider text-brand-600">
          Dixon Doggy Day Care and Boarding
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl">
          A second home for your best friend.
        </h1>
        <p className="mt-4 text-lg text-stone-600">
          Day care, boarding, and a whole lot of belly rubs.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup" className="btn-primary">
            Create an account
          </Link>
          <Link href="/login" className="btn-secondary">
            Sign in
          </Link>
        </div>
        <p className="mt-10 text-sm text-stone-500">
          Staff member?{" "}
          <Link href="/staff/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in to the operator dashboard
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

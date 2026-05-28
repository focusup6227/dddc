import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { MascotFace } from "@/components/illustrations";
import { ToastNotifier } from "@/components/ToastNotifier";
import { SetPasswordForm } from "./SetPasswordForm";

const TOASTS = [{ param: "error", tone: "error" as const }];

export default async function SetPasswordPage() {
  const session = await getSessionProfile();
  if (!session) {
    redirect(
      "/login?error=" +
        encodeURIComponent(
          "Your invite link is no longer valid. Ask your manager to send a new one.",
        ),
    );
  }

  const role = session.profile.role;
  const roleLabel =
    role === "staff"
      ? "operator"
      : role === "junior_staff"
        ? "junior staff"
        : "customer";

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
          Welcome to the team
        </h1>
        <p className="mt-1 text-center text-sm text-ink-500">
          Set a password to finish setting up your {roleLabel} account.
        </p>

        <ToastNotifier toasts={TOASTS} />

        <div className="mt-6">
          <SetPasswordForm />
        </div>
      </main>
    </div>
  );
}

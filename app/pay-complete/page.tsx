// Public landing page the CUSTOMER's phone is sent to after paying via the
// kiosk QR code. Deliberately auth-free (the kiosk screen itself tracks the
// payment and shows the ✓ — this is just a friendly "you're done" for the
// phone, which isn't logged in as staff).
export const dynamic = "force-dynamic";

export default async function PayCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>;
}) {
  const { canceled } = await searchParams;
  const ok = !canceled;

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream-50 p-6">
      <div className="w-full max-w-sm rounded-3xl border border-stone-200/80 bg-white p-8 text-center shadow-soft">
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl ${
            ok ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-ink-500"
          }`}
        >
          {ok ? "✓" : "—"}
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold text-ink-900">
          {ok ? "Payment received" : "Payment canceled"}
        </h1>
        <p className="mt-2 text-ink-600">
          {ok
            ? "Thanks! You're all set — you can hand the device back to the front desk. 🐾"
            : "No charge was made. Please hand the device back to the front desk."}
        </p>
      </div>
    </main>
  );
}

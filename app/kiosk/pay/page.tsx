import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { requireFullStaff } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { formatMoney } from "@/lib/format";
import { AutoRefresh } from "../AutoRefresh";

export const dynamic = "force-dynamic";

// Pull the Checkout session id out of its hosted URL, e.g.
// https://checkout.stripe.com/c/pay/cs_live_a1B2c3...#fid=...
function sessionIdFromUrl(url: string): string | null {
  return url.match(/cs_(?:test|live)_[A-Za-z0-9]+/)?.[0] ?? null;
}

/**
 * "Scan to pay on your phone." Shows a QR code of the Stripe Checkout URL the
 * kiosk just created. The customer scans it, pays on their own phone (Apple
 * Pay / card), and this screen — polling the Stripe session every few seconds —
 * flips to a ✓ the moment payment lands. There's also a "pay on this screen"
 * fallback for handing the tablet over directly.
 */
export default async function KioskQrPayPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  await requireFullStaff();
  const { u } = await searchParams;
  if (!u) redirect("/kiosk");
  const checkoutUrl = decodeURIComponent(u);

  const sessionId = sessionIdFromUrl(checkoutUrl);
  if (!sessionId) redirect("/kiosk");

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const paid =
    session.payment_status === "paid" || session.status === "complete";
  const expired = session.status === "expired";
  const amountCents = session.amount_total ?? 0;

  if (paid) {
    return (
      <Shell>
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl text-emerald-700">
          ✓
        </div>
        <h1 className="mt-5 font-display text-3xl font-bold text-ink-900">
          Payment received
        </h1>
        {amountCents > 0 && (
          <p className="mt-1 text-lg text-ink-600">{formatMoney(amountCents)}</p>
        )}
        <Link
          href="/kiosk"
          className="mt-7 block w-full rounded-2xl bg-emerald-600 px-6 py-4 font-display text-xl font-semibold text-white shadow-soft transition-all hover:bg-emerald-700 active:translate-y-px"
        >
          Back to today
        </Link>
      </Shell>
    );
  }

  if (expired) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-bold text-ink-900">
          This payment link expired
        </h1>
        <p className="mt-2 text-ink-600">Start the payment again from the kiosk.</p>
        <Link href="/kiosk" className="btn-primary mt-6 inline-block">
          Back to today
        </Link>
      </Shell>
    );
  }

  const qrDataUrl = await QRCode.toDataURL(checkoutUrl, {
    width: 320,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return (
    <Shell>
      {/* Re-render every few seconds to catch the payment as soon as it lands. */}
      <AutoRefresh intervalMs={3000} />
      <h1 className="font-display text-3xl font-bold text-ink-900">
        Scan to pay
      </h1>
      {amountCents > 0 && (
        <p className="mt-1 text-lg font-semibold text-ink-700">
          {formatMoney(amountCents)}
        </p>
      )}
      <p className="mt-1 text-sm text-ink-500">
        Point your phone&apos;s camera at the code to pay — Apple Pay, Google
        Pay, or card.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qrDataUrl}
        alt="Payment QR code"
        width={320}
        height={320}
        className="mx-auto mt-5 rounded-2xl border border-stone-200/80 bg-white p-3 shadow-soft"
      />
      <p className="mt-5 flex items-center justify-center gap-2 text-sm text-ink-500">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
        Waiting for payment…
      </p>
      <a
        href={checkoutUrl}
        className="mt-6 block w-full rounded-2xl border border-stone-200/80 bg-white px-6 py-3 text-center font-semibold text-ink-800 transition-colors hover:bg-cream-50"
      >
        Or pay on this screen
      </a>
      <Link
        href="/kiosk"
        className="mt-3 block text-center text-sm font-medium text-ink-500 hover:text-ink-700 hover:underline"
      >
        Cancel
      </Link>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md animate-fade-up py-4 text-center">
      <div className="rounded-3xl border border-stone-200/80 bg-white p-8 shadow-soft">
        {children}
      </div>
    </div>
  );
}

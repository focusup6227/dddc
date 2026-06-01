import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, todayISO, addDays } from "@/lib/format";
import { getDayCounts, getMaxDogsPerDay, getMaxDogsPerNight } from "@/lib/settings";
import type { Package, ServiceKind } from "@/lib/supabase/types";
import {
  PawIcon,
  ShieldPaw,
  HeartPaw,
  MascotFace,
  TennisBall,
} from "@/components/illustrations";
import {
  business,
  fullAddress,
  mapEmbedUrl,
  mapLinkUrl,
  hours,
  faqs,
} from "@/lib/business";

const BOARDING_RATE_CENTS = 3000;

const FEATURES = [
  {
    Icon: MascotFace,
    title: "Small-group play",
    body: "We keep our pack intentionally small so every dog gets real attention, real play, and real rest.",
  },
  {
    Icon: ShieldPaw,
    title: "Safe & supervised",
    body: "Fully fenced, always watched. You get photo report cards and an alert the moment anything comes up.",
  },
  {
    Icon: HeartPaw,
    title: "Treated like family",
    body: "Belly rubs included. We track meals, meds, and routines so your dog's day feels just like home.",
  },
];

const STEPS = [
  { n: "01", title: "Create an account", body: "Add your dog's profile, vaccines, and the little things that make them them." },
  { n: "02", title: "Book a day or a stay", body: "Pick day care or boarding, choose your dates, and you're on the calendar." },
  { n: "03", title: "Drop off & relax", body: "Check in at the kiosk, then watch the photo updates roll in all day." },
];

const GALLERY = [
  { src: "/photos/happy-lab.jpg", w: 960, h: 1280, caption: "Pickup-time smiles", alt: "Happy yellow Labrador grinning with its tongue out" },
  { src: "/photos/play-yard.jpg", w: 552, h: 1196, caption: "Group play in the fenced yard", alt: "A black Lab and a golden retriever playing together in a fenced grassy yard" },
  { src: "/photos/trail-walk.jpg", w: 960, h: 1280, caption: "Afternoon trail walks", alt: "Point-of-view of a husky on a leash hiking a shaded forest trail" },
  { src: "/photos/boarding-livingroom.jpg", w: 960, h: 1280, caption: "Sleepovers, couches included", alt: "Three dogs relaxing on couches and a dog bed in a cozy living room" },
  { src: "/photos/pack-walk.jpg", w: 960, h: 1280, caption: "The whole crew", alt: "Three kids walking three dogs on leashes down a tree-lined lane" },
  { src: "/photos/couch-rest.jpg", w: 1536, h: 2048, caption: "Earned a good rest", alt: "A husky mix curled up resting on a grey couch" },
];

type AvailStatus = "open" | "limited" | "full";

function statusFor(count: number, max: number): AvailStatus {
  const remaining = max - count;
  if (remaining <= 0) return "full";
  // Flag scarcity when a quarter or less of capacity is left.
  if (remaining <= Math.max(1, Math.ceil(max * 0.25))) return "limited";
  return "open";
}

const STATUS_META: Record<
  AvailStatus,
  { label: string; dot: string; text: string }
> = {
  open: { label: "Open", dot: "bg-emerald-500", text: "text-emerald-700" },
  limited: { label: "Few spots", dot: "bg-amber-500", text: "text-amber-700" },
  full: { label: "Full", dot: "bg-stone-400", text: "text-ink-400" },
};

const AVAIL_DAYS = 14;

function dayParts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return { weekday: dt.toLocaleDateString("en-US", { weekday: "short" }), day: d };
}

export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("packages")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  const packages = (data ?? []) as Package[];

  // Public, two-week availability — shown as Open / Few spots / Full so we
  // signal scarcity without exposing exact headcounts.
  const availDates = Array.from({ length: AVAIL_DAYS }, (_, i) =>
    addDays(todayISO(), i),
  );
  const [dayCounts, nightCounts, maxDay, maxNight] = await Promise.all([
    getDayCounts(availDates, "daycare"),
    getDayCounts(availDates, "boarding"),
    getMaxDogsPerDay(),
    getMaxDogsPerNight(),
  ]);
  const availability: { kind: ServiceKind; label: string; days: { iso: string; status: AvailStatus }[] }[] = [
    {
      kind: "daycare",
      label: "Day care",
      days: availDates.map((d) => ({ iso: d, status: statusFor(dayCounts.get(d) ?? 0, maxDay) })),
    },
    {
      kind: "boarding",
      label: "Boarding",
      days: availDates.map((d) => ({ iso: d, status: statusFor(nightCounts.get(d) ?? 0, maxNight) })),
    },
  ];

  return (
    <main className="relative overflow-hidden">
      {/* Atmospheric background: warm fade + paw texture + soft glows */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-warm-fade" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-paw-pattern" />
      <div className="pointer-events-none absolute -left-32 top-[-6rem] -z-10 h-96 w-96 rounded-full bg-brand-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 top-40 -z-10 h-[28rem] w-[28rem] rounded-full bg-cream-200/50 blur-3xl" />

      {/* ───────────────────────── Hero ───────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-12 pt-16 sm:pt-24">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div className="animate-fade-up text-center md:text-left">
            <span className="pill-warm">
              <PawIcon className="h-3.5 w-3.5" />
              Day care · Boarding · Belly rubs
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
              A second home for{" "}
              <span className="relative whitespace-nowrap text-brand-600">
                your best friend
                <svg
                  aria-hidden
                  viewBox="0 0 300 16"
                  className="absolute -bottom-2 left-0 h-3 w-full text-brand-300"
                  fill="none"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M3 11C60 4 140 3 297 8"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              .
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-ink-700">
              Dixon Doggy Day Care &amp; Boarding is a tiny, family-run spot where
              your pup spends the day playing, napping, and getting spoiled — never
              kenneled, never alone.
            </p>
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center md:justify-start">
              <Link href="/signup" className="btn-primary px-5 py-3 text-base">
                <PawIcon className="h-4 w-4" />
                Create an account
              </Link>
              <Link href="/login" className="btn-secondary px-5 py-3 text-base">
                Sign in
              </Link>
            </div>
          </div>

          {/* Logo + playful framing */}
          <div className="relative mx-auto animate-fade-in">
            <div className="absolute inset-0 -z-10 rotate-6 rounded-[2.5rem] bg-brand-100/70" />
            <div className="rounded-[2.5rem] border border-stone-200/70 bg-white p-3 shadow-lift">
              <Image
                src="/logo.jpg"
                alt="Dixon Doggy Day Care and Boarding"
                width={420}
                height={420}
                priority
                className="h-64 w-64 rounded-[2rem] object-cover sm:h-80 sm:w-80"
              />
            </div>
            <div className="absolute -bottom-5 -left-5 flex items-center gap-2 rounded-2xl border border-stone-200/70 bg-white px-3.5 py-2.5 text-sm font-semibold text-ink-900 shadow-soft">
              <TennisBall className="h-7 w-7 text-brand-600" />
              Tails wagging since day one
            </div>
            <MascotFace className="absolute -right-4 -top-4 h-16 w-16 text-brand-500 drop-shadow-sm" />
          </div>
        </div>
      </section>

      {/* ──────────────────────── Features ─────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {FEATURES.map(({ Icon, title, body }) => (
            <div key={title} className="card-lift">
              <Icon className="h-14 w-14 text-brand-500" />
              <h3 className="mt-4 text-lg font-semibold text-ink-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ──────────────────────── Gallery ──────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="text-center">
          <span className="pill-warm">
            <PawIcon className="h-3.5 w-3.5" />
            The pack
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink-900">
            A few of our happy regulars
          </h2>
          <p className="mt-2 text-ink-700">
            Real dogs, real days — playing, hiking, and napping like they own the place.
          </p>
        </div>

        <div className="mt-10 columns-2 gap-3 sm:gap-4 md:columns-3 [&>*]:mb-3 sm:[&>*]:mb-4">
          {GALLERY.map((photo) => (
            <figure
              key={photo.src}
              className="group relative break-inside-avoid overflow-hidden rounded-2xl border border-stone-200/70 bg-white shadow-soft"
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                width={photo.w}
                height={photo.h}
                sizes="(min-width: 768px) 33vw, 50vw"
                className="h-auto w-full transition-transform duration-500 ease-out group-hover:scale-[1.04]"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-900/55 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <figcaption className="text-sm font-medium text-white">
                  {photo.caption}
                </figcaption>
              </div>
            </figure>
          ))}
        </div>
      </section>

      {/* ─────────────────────── How it works ──────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="text-center">
          <span className="pill-neutral">How it works</span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink-900">
            From stranger to regular in three steps
          </h2>
        </div>
        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="relative">
              <span className="font-display text-5xl font-bold text-brand-200">
                {s.n}
              </span>
              <h3 className="mt-2 text-lg font-semibold text-ink-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ────────────────────── Availability ───────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="text-center">
          <span className="pill-warm">
            <PawIcon className="h-3.5 w-3.5" />
            Plan your visit
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink-900">
            Two weeks of availability
          </h2>
          <p className="mt-2 text-ink-700">
            A quick look at what&apos;s open. Create an account to grab a spot.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-ink-600">
            {(["open", "limited", "full"] as AvailStatus[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_META[s].dot}`} />
                {STATUS_META[s].label}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-10 space-y-6">
          {availability.map((track) => (
            <div key={track.kind} className="card">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-ink-900">{track.label}</h3>
                <span className="text-xs text-ink-500">Next {AVAIL_DAYS} days</span>
              </div>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
                {track.days.map(({ iso, status }) => {
                  const { weekday, day } = dayParts(iso);
                  const meta = STATUS_META[status];
                  return (
                    <div
                      key={iso}
                      className={`flex min-w-[3.75rem] flex-col items-center rounded-xl border border-stone-200 px-2 py-2.5 ${
                        status === "full" ? "bg-stone-50" : "bg-white"
                      }`}
                    >
                      <span className="text-[0.65rem] font-medium uppercase tracking-wide text-ink-400">
                        {weekday}
                      </span>
                      <span
                        className={`text-lg font-semibold ${
                          status === "full" ? "text-ink-400" : "text-ink-900"
                        }`}
                      >
                        {day}
                      </span>
                      <span className={`mt-1.5 h-2 w-2 rounded-full ${meta.dot}`} title={meta.label} />
                      <span className={`mt-1 text-[0.6rem] font-medium ${meta.text}`}>
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 text-center">
          <Link href="/signup" className="btn-primary px-5 py-2.5">
            <PawIcon className="h-4 w-4" />
            Reserve a spot
          </Link>
        </div>
      </section>

      {/* ───────────────────────── Pricing ─────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="text-center">
          <span className="pill-warm">
            <PawIcon className="h-3.5 w-3.5" />
            Pricing
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink-900">
            Simple, honest rates
          </h2>
          <p className="mt-2 text-ink-700">
            Per-dog pricing. Save when you prepay with a daycare pack.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="card">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-ink-900">Day Care</h3>
              <span className="pill-success">Most popular</span>
            </div>
            <p className="mt-1 text-sm text-ink-700">
              Drop-off and pickup, group play all day long.
            </p>
            <ul className="mt-4 divide-y divide-stone-200">
              {packages.map((p) => {
                const perDay = Math.round(p.price_cents / p.days_included);
                const isDropIn = p.days_included === 1;
                return (
                  <li key={p.id} className="flex items-baseline justify-between py-3">
                    <div>
                      <p className="font-medium text-ink-900">{p.name}</p>
                      <p className="text-xs text-ink-500">
                        {isDropIn
                          ? "Pay-as-you-go"
                          : `${p.days_included} days · ${formatMoney(perDay)} / day`}
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-ink-900">
                      {formatMoney(p.price_cents)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-ink-900">Boarding</h3>
            <p className="mt-1 text-sm text-ink-700">
              Overnight stays in our home. Includes day care during the stay.
            </p>
            <ul className="mt-4 divide-y divide-stone-200">
              <li className="flex items-baseline justify-between py-3">
                <div>
                  <p className="font-medium text-ink-900">Per night</p>
                  <p className="text-xs text-ink-500">Per dog</p>
                </div>
                <p className="text-lg font-semibold text-ink-900">
                  {formatMoney(BOARDING_RATE_CENTS)}
                </p>
              </li>
            </ul>
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-ink-700">
          Add a <span className="font-semibold text-ink-900">bath</span> to any
          day care or boarding stay for{" "}
          <span className="font-semibold text-ink-900">{formatMoney(1000)}</span>{" "}
          — your pup goes home clean and fresh.
        </p>
      </section>

      {/* ─────────────────── Hours & Location ──────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Hours */}
          <div className="card">
            <h2 className="text-xl font-semibold text-ink-900">Hours</h2>
            <p className="mt-1 text-sm text-ink-700">
              Drop-off and pickup during open hours.
            </p>
            <ul className="mt-4 divide-y divide-stone-200">
              {hours.map(({ day, hours: h }) => (
                <li
                  key={day}
                  className="flex items-baseline justify-between py-2.5 text-sm"
                >
                  <span className="font-medium text-ink-900">{day}</span>
                  <span className={h ? "text-ink-700" : "text-ink-400"}>
                    {h ?? "Closed"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Location */}
          <div className="card flex flex-col">
            <h2 className="text-xl font-semibold text-ink-900">Where we are</h2>
            <p className="mt-1 text-sm text-ink-700">{fullAddress}</p>
            <a
              href={mapLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 block overflow-hidden rounded-xl border border-stone-200"
            >
              <iframe
                title="Map to Dixon Doggy Day Care"
                src={mapEmbedUrl}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-56 w-full"
              />
            </a>
            <a
              href={mapLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Get directions →
            </a>
          </div>
        </div>
      </section>

      {/* ───────────────────────── FAQ ─────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-12">
        <div className="text-center">
          <span className="pill-neutral">Good to know</span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink-900">
            Frequently asked questions
          </h2>
        </div>
        <div className="mt-10 space-y-3">
          {faqs.map(({ q, a }) => (
            <details
              key={q}
              className="group card cursor-pointer transition-colors hover:border-stone-300"
            >
              <summary className="flex list-none items-center justify-between gap-4 font-semibold text-ink-900 [&::-webkit-details-marker]:hidden">
                {q}
                <span className="shrink-0 text-brand-500 transition-transform duration-200 group-open:rotate-45">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-ink-700">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ──────────────────────── CTA band ─────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="relative overflow-hidden rounded-3xl bg-brand-600 px-8 py-14 text-center shadow-glow">
          <div className="pointer-events-none absolute inset-0 bg-paw-pattern opacity-30 mix-blend-overlay" />
          <PawIcon className="mx-auto h-10 w-10 text-brand-100" />
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white">
            Ready for a wagging-tail welcome?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-brand-50">
            Set up your dog&apos;s profile in a couple of minutes and book their first day.
          </p>
          <Link
            href="/signup"
            className="btn mt-7 bg-white px-6 py-3 text-base text-brand-700 shadow-soft hover:bg-cream-50 active:translate-y-px"
          >
            Get started
          </Link>
        </div>
      </section>

      {/* ───────────────────────── Footer ──────────────────────── */}
      <footer className="border-t border-stone-200/70 py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-6 text-center text-sm text-ink-500">
          <Image
            src="/logo.jpg"
            alt="Dixon Doggy Day Care and Boarding"
            width={56}
            height={56}
            className="h-12 w-12 rounded-full shadow-soft"
          />
          <p className="font-display text-base font-semibold text-ink-900">
            Dixon Doggy Day Care &amp; Boarding
          </p>
          <div className="flex flex-col items-center gap-1 text-ink-700 sm:flex-row sm:gap-4">
            <a href={business.phoneHref} className="hover:text-brand-700">
              {business.phone}
            </a>
            <span className="hidden text-ink-400 sm:inline">·</span>
            <a href={`mailto:${business.email}`} className="hover:text-brand-700">
              {business.email}
            </a>
            <span className="hidden text-ink-400 sm:inline">·</span>
            <a
              href={mapLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:text-brand-700"
            >
              {fullAddress}
            </a>
          </div>
          <p>
            Staff member?{" "}
            <Link
              href="/staff/login"
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              Sign in to the operator dashboard
            </Link>
            .
          </p>
        </div>
      </footer>
    </main>
  );
}

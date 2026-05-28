# Dixon Doggy Day Care

A management dashboard + customer portal for a doggy day care, built on
**Next.js 15** (App Router), **Supabase** (auth + Postgres + Storage), and
**Stripe** (Checkout + Webhooks).

## What's inside

- **Customer portal** (`/dashboard`, `/dogs`, `/book`, `/packages`, `/bookings`)
  - Account signup
  - Electronic liability waiver (typed signature + IP + timestamp)
  - Dog profiles with photo upload, vet info, vaccinations, allergies, feeding & behavior notes
  - Book individual days; redeem from a prepaid package or pay drop-in via Stripe
  - View upcoming bookings and package balance
- **Operator dashboard** (`/staff`)
  - Today view with one-tap check-in / check-out
  - Bookings calendar (filterable by date range)
  - Customers list + per-customer detail (dogs, waivers, packages, bookings)
  - Dog profiles with staff-only notes + a daily journal note the owner sees
  - Package catalog management
- **Stripe webhook** at `/api/stripe/webhook` flips packages and drop-in bookings
  to `paid` once Stripe confirms the charge.

## Quick start

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. In **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`
3. In the **SQL Editor**, run the migrations in order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_rls.sql`
   - `supabase/migrations/0003_storage.sql`
   - `supabase/migrations/0004_seed.sql`
4. **Auth → Providers → Email**: for local development, disable
   "Confirm email" so signups can immediately log in.

### 3. Set up Stripe

1. Get keys from [Stripe Dashboard → Developers → API keys](https://dashboard.stripe.com/test/apikeys).
   - Publishable → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - Secret → `STRIPE_SECRET_KEY`
2. Install the Stripe CLI and forward webhooks during dev:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   Copy the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET`.

### 4. Environment

Copy `.env.example` to `.env.local` and fill in the values above.

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>.

## Promoting a user to staff

Customers sign up at `/signup`. To make an account a staff/operator account,
flip the `role` column in Supabase:

```sql
update public.profiles set role = 'staff' where email = 'you@example.com';
```

Then sign in at `/staff/login`.

## Architecture notes

- **Auth/RLS.** Customers have full access to *their own* data (profile, dogs,
  bookings, packages, waivers, daily notes about their dogs). Staff have full
  access to everything. Enforced by Postgres Row Level Security; see
  `supabase/migrations/0002_rls.sql`.
- **Photo uploads** go to a public Supabase Storage bucket called
  `dog-photos`. Object paths are `<owner_id>/<dog_id>/<timestamp>.<ext>` so
  storage RLS can derive ownership from the path.
- **Booking → payment.** When a customer books, we allocate paid-package days
  first (FIFO). Any remaining days become a Stripe Checkout session; we
  pre-create the `bookings` rows as `unpaid` with the session id, and the
  webhook flips them to `paid` on `checkout.session.completed`.
- **Idempotency.** All processed Stripe events get logged in `stripe_events`
  by `event.id`, so retries don't double-count.
- **Drop-in pricing** is derived from whichever active 1-day package has the
  lowest price. Change the seed in `0004_seed.sql` or via `/staff/packages`.

## Project layout

```
app/
  (auth)/        login, signup, logout
  (customer)/    customer portal (layout enforces requireCustomer)
  staff/         operator dashboard (each page enforces requireStaff)
  api/stripe/    Stripe webhook
lib/
  supabase/      server + browser + middleware clients, types
  auth.ts        requireUser / requireCustomer / requireStaff
  stripe.ts      Stripe client singleton
  format.ts      money + date helpers
components/      shared UI bits
supabase/
  migrations/    SQL schema, RLS, storage, seed
```

## Things you'll likely customize

- **Waiver text** — edit `0004_seed.sql` and bump the version, then insert a
  new row (it auto-supersedes the previous active waiver).
- **Pricing** — manage packages from `/staff/packages` or edit the seed file.
- **Branding** — colors are in `tailwind.config.ts` (`brand.*`). Logo and
  copy on the landing page in `app/page.tsx`.
- **Email confirmations** — controlled in Supabase's Auth settings. If you
  re-enable them, signed-up users will land on a login screen with a "check
  your email" hint instead of going straight to the waiver step.

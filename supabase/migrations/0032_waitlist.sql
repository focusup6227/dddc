-- Waitlist. When a day (daycare) or a stretch of nights (boarding) is full, a
-- customer can join the waitlist for those dates. When a spot frees up — a
-- cancellation — we offer it to the FIRST person in line and give them a short
-- window to claim it before rolling to the next person.
--
-- How the "hold" works without touching capacity counting anywhere: an offer
-- is a real `reserved` + `unpaid` booking row created on the waitlisted
-- customer's behalf, stamped with `waitlist_offer_expires_at`. Because
-- getDayCounts() already counts every non-canceled booking, that held row
-- protects the freed spot from walk-up bookers automatically. The customer
-- "claims" it through the normal Pay-now flow; if the window lapses unpaid, a
-- cron cancels the held booking (freeing the spot) and offers the next person.

-- Marker on the held booking. Set => this reserved/unpaid row is a time-limited
-- waitlist offer, not an ordinary reservation; null once it's an ordinary one.
alter table public.bookings
  add column if not exists waitlist_offer_expires_at timestamptz;

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  service_kind service_kind not null default 'daycare',
  -- Desired span, half-open [service_date, service_end_date). Daycare is a
  -- single day (end = date + 1); boarding is the night range.
  service_date date not null,
  service_end_date date not null,
  -- waiting | offered | claimed | expired | canceled
  status text not null default 'waiting',
  offered_booking_id uuid references public.bookings(id) on delete set null,
  offer_expires_at timestamptz,
  offered_at timestamptz,
  created_at timestamptz not null default now()
);

-- At most one live entry per dog + exact span, so a customer can't pile up
-- duplicate spots in line. Claimed/expired/canceled rows don't count.
create unique index if not exists waitlist_active_uniq
  on public.waitlist_entries(dog_id, service_kind, service_date, service_end_date)
  where status in ('waiting', 'offered');

-- Queue processing: oldest waiting/offered first, scoped by kind.
create index if not exists waitlist_proc_idx
  on public.waitlist_entries(service_kind, status, created_at);
create index if not exists waitlist_customer_idx
  on public.waitlist_entries(customer_id, status);

alter table public.waitlist_entries enable row level security;

drop policy if exists "waitlist self read"   on public.waitlist_entries;
drop policy if exists "waitlist self insert" on public.waitlist_entries;
drop policy if exists "waitlist self update" on public.waitlist_entries;
drop policy if exists "waitlist staff all"   on public.waitlist_entries;

create policy "waitlist self read"
  on public.waitlist_entries for select to authenticated
  using (customer_id = auth.uid());

create policy "waitlist self insert"
  on public.waitlist_entries for insert to authenticated
  with check (customer_id = auth.uid());

-- Customers can update their own rows (used to leave/decline). Offer creation
-- and expiry roll-over run through the service client, which bypasses RLS.
create policy "waitlist self update"
  on public.waitlist_entries for update to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

create policy "waitlist staff all"
  on public.waitlist_entries for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Optional per-stay add-ons. Currently just a $10 dog wash that a customer can
-- tack onto a daycare or boarding booking, or that staff can add at the kiosk
-- after the fact. Each add-on carries its OWN payment lifecycle so it can be
-- charged even when the underlying stay is already paid (or fully covered by a
-- package). One row per add-on, linked to the booking it rides on.

create table if not exists public.booking_addons (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'dog_wash',
  amount_cents int not null,
  payment_status payment_status not null default 'unpaid',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now()
);

create index if not exists booking_addons_booking_idx
  on public.booking_addons(booking_id);
create index if not exists booking_addons_session_idx
  on public.booking_addons(stripe_checkout_session_id);

alter table public.booking_addons enable row level security;

drop policy if exists "addons self read" on public.booking_addons;
drop policy if exists "addons staff all" on public.booking_addons;

-- Customers can read their own add-ons (inserts/updates go through the service
-- client, which bypasses RLS, exactly like the booking payment flow).
create policy "addons self read"
  on public.booking_addons for select to authenticated
  using (customer_id = auth.uid());

create policy "addons staff all"
  on public.booking_addons for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

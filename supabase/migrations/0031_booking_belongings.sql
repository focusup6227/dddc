-- Belongings checklist. Tracks the physical stuff an owner drops off with a dog
-- — leash, bed, blanket, a bag of food with a scoop, a favorite toy, meds, etc.
-- — so whoever handles pickup (not just whoever did drop-off) can send every
-- item home and nothing gets lost. One row per item, tied to the booking it
-- rides on; dog_id + customer_id are denormalized so we can prefill a regular's
-- usual items from their last stay and let customers read their own list.

create table if not exists public.booking_belongings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  quantity int not null default 1 check (quantity >= 1),
  notes text,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references public.profiles(id),
  returned_at timestamptz,
  returned_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists booking_belongings_booking_idx
  on public.booking_belongings(booking_id);
-- Prefill looks up a dog's most recent prior items.
create index if not exists booking_belongings_dog_idx
  on public.booking_belongings(dog_id, checked_in_at desc);

alter table public.booking_belongings enable row level security;

drop policy if exists "belongings self read" on public.booking_belongings;
drop policy if exists "belongings staff all" on public.booking_belongings;

-- Customers can read their own belongings (writes go through the service client
-- at the kiosk, which bypasses RLS, exactly like booking_addons).
create policy "belongings self read"
  on public.booking_belongings for select to authenticated
  using (customer_id = auth.uid());

create policy "belongings staff all"
  on public.booking_belongings for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- 0022_push_logs_waitlist_belongings_pickups.sql
--
-- Five new features:
--   1. push_subscriptions  — Web Push endpoints per user
--   2. dog_log_entries     — staff-recorded meals / meds / potty / water per dog
--   3. waitlist_entries    — customers join when a date is full; first in line
--                           gets notified when a slot opens up
--   4. booking_belongings  — checklist of items the owner brought (bed, leash,
--                           food bag, medication, etc.) for a booking
--   5. authorized_pickups  — people other than the owner who may pick the dog
--                           up; shown to staff at the kiosk

-- ---------- 1. PUSH SUBSCRIPTIONS ----------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push subs self all"   on public.push_subscriptions;
drop policy if exists "push subs staff read" on public.push_subscriptions;

create policy "push subs self all"
  on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "push subs staff read"
  on public.push_subscriptions for select to authenticated
  using (public.is_staff());

-- ---------- 2. DOG LOG ENTRIES ----------
do $$ begin
  create type dog_log_kind as enum ('meal', 'medication', 'potty', 'water', 'rest');
exception when duplicate_object then null; end $$;

create table if not exists public.dog_log_entries (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  kind dog_log_kind not null,
  detail text,
  given_at timestamptz not null default now(),
  given_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists dog_log_entries_dog_idx
  on public.dog_log_entries(dog_id, given_at desc);
create index if not exists dog_log_entries_booking_idx
  on public.dog_log_entries(booking_id);

alter table public.dog_log_entries enable row level security;

drop policy if exists "dog log owner read" on public.dog_log_entries;
drop policy if exists "dog log staff all"  on public.dog_log_entries;

create policy "dog log owner read"
  on public.dog_log_entries for select to authenticated
  using (exists (
    select 1 from public.dogs d
    where d.id = dog_log_entries.dog_id and d.owner_id = auth.uid()
  ));

create policy "dog log staff all"
  on public.dog_log_entries for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- 3. WAITLIST ----------
do $$ begin
  create type waitlist_status as enum (
    'pending', 'notified', 'claimed', 'expired', 'canceled'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  service_date date not null,
  service_kind text not null default 'daycare'
    check (service_kind in ('daycare', 'boarding')),
  status waitlist_status not null default 'pending',
  notified_at timestamptz,
  expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists waitlist_entries_customer_idx
  on public.waitlist_entries(customer_id);
create index if not exists waitlist_entries_date_idx
  on public.waitlist_entries(service_date, service_kind, status, created_at);
-- One active entry per (dog, date, kind). Lets a customer rejoin after expiring.
create unique index if not exists waitlist_entries_active_unique
  on public.waitlist_entries(dog_id, service_date, service_kind)
  where status in ('pending', 'notified');

alter table public.waitlist_entries enable row level security;

drop policy if exists "waitlist self all"  on public.waitlist_entries;
drop policy if exists "waitlist staff all" on public.waitlist_entries;

create policy "waitlist self all"
  on public.waitlist_entries for all to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

create policy "waitlist staff all"
  on public.waitlist_entries for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- 4. BELONGINGS CHECKLIST ----------
create table if not exists public.booking_belongings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  item text not null,
  notes text,
  brought_in_at timestamptz,
  brought_in_by uuid references public.profiles(id),
  returned_at timestamptz,
  returned_by uuid references public.profiles(id),
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists booking_belongings_booking_idx
  on public.booking_belongings(booking_id);

alter table public.booking_belongings enable row level security;

drop policy if exists "belongings owner all"  on public.booking_belongings;
drop policy if exists "belongings staff all"  on public.booking_belongings;

create policy "belongings owner all"
  on public.booking_belongings for all to authenticated
  using (exists (
    select 1 from public.bookings b
    where b.id = booking_belongings.booking_id
      and b.customer_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.bookings b
    where b.id = booking_belongings.booking_id
      and b.customer_id = auth.uid()
  ));

create policy "belongings staff all"
  on public.booking_belongings for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- 5. AUTHORIZED PICKUPS ----------
create table if not exists public.authorized_pickups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  phone text,
  relation text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists authorized_pickups_customer_idx
  on public.authorized_pickups(customer_id);

alter table public.authorized_pickups enable row level security;

drop policy if exists "auth pickups self all"  on public.authorized_pickups;
drop policy if exists "auth pickups staff all" on public.authorized_pickups;

create policy "auth pickups self all"
  on public.authorized_pickups for all to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

create policy "auth pickups staff all"
  on public.authorized_pickups for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

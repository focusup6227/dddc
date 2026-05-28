-- Row Level Security: customers see only their own data; staff sees everything.

-- Helper: is the current user a staff member?
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'staff'
  );
$$;

grant execute on function public.is_staff() to authenticated;

-- Enable RLS
alter table public.profiles            enable row level security;
alter table public.dogs                enable row level security;
alter table public.waivers             enable row level security;
alter table public.waiver_signatures   enable row level security;
alter table public.packages            enable row level security;
alter table public.customer_packages   enable row level security;
alter table public.bookings            enable row level security;
alter table public.check_ins           enable row level security;
alter table public.dog_notes           enable row level security;
alter table public.stripe_events       enable row level security;

-- ---------- profiles ----------
drop policy if exists "profiles self read"  on public.profiles;
drop policy if exists "profiles staff read" on public.profiles;
drop policy if exists "profiles self update" on public.profiles;
drop policy if exists "profiles staff update" on public.profiles;

create policy "profiles self read"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "profiles staff read"
  on public.profiles for select to authenticated
  using (public.is_staff());

create policy "profiles self update"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

create policy "profiles staff update"
  on public.profiles for update to authenticated
  using (public.is_staff());

-- ---------- dogs ----------
drop policy if exists "dogs owner all"  on public.dogs;
drop policy if exists "dogs staff all"  on public.dogs;

create policy "dogs owner all"
  on public.dogs for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "dogs staff all"
  on public.dogs for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- waivers (templates) ----------
drop policy if exists "waivers read all" on public.waivers;
drop policy if exists "waivers staff write" on public.waivers;

create policy "waivers read all"
  on public.waivers for select to authenticated
  using (true);

create policy "waivers staff write"
  on public.waivers for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- waiver_signatures ----------
drop policy if exists "waiver sigs self read"   on public.waiver_signatures;
drop policy if exists "waiver sigs self insert" on public.waiver_signatures;
drop policy if exists "waiver sigs staff read"  on public.waiver_signatures;

create policy "waiver sigs self read"
  on public.waiver_signatures for select to authenticated
  using (user_id = auth.uid());

create policy "waiver sigs self insert"
  on public.waiver_signatures for insert to authenticated
  with check (user_id = auth.uid());

create policy "waiver sigs staff read"
  on public.waiver_signatures for select to authenticated
  using (public.is_staff());

-- ---------- packages (catalog) ----------
drop policy if exists "packages read all" on public.packages;
drop policy if exists "packages staff write" on public.packages;

create policy "packages read all"
  on public.packages for select to authenticated
  using (active or public.is_staff());

create policy "packages staff write"
  on public.packages for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- customer_packages ----------
drop policy if exists "cust pkgs self read"   on public.customer_packages;
drop policy if exists "cust pkgs staff all"   on public.customer_packages;

create policy "cust pkgs self read"
  on public.customer_packages for select to authenticated
  using (customer_id = auth.uid());

create policy "cust pkgs staff all"
  on public.customer_packages for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- bookings ----------
drop policy if exists "bookings self read"   on public.bookings;
drop policy if exists "bookings self insert" on public.bookings;
drop policy if exists "bookings self update" on public.bookings;
drop policy if exists "bookings staff all"   on public.bookings;

create policy "bookings self read"
  on public.bookings for select to authenticated
  using (customer_id = auth.uid());

create policy "bookings self insert"
  on public.bookings for insert to authenticated
  with check (customer_id = auth.uid());

create policy "bookings self update"
  on public.bookings for update to authenticated
  using (customer_id = auth.uid() and status = 'reserved')
  with check (customer_id = auth.uid());

create policy "bookings staff all"
  on public.bookings for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- check_ins ----------
drop policy if exists "checkins self read" on public.check_ins;
drop policy if exists "checkins staff all" on public.check_ins;

create policy "checkins self read"
  on public.check_ins for select to authenticated
  using (exists (
    select 1 from public.bookings b
    where b.id = check_ins.booking_id and b.customer_id = auth.uid()
  ));

create policy "checkins staff all"
  on public.check_ins for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- dog_notes ----------
drop policy if exists "dog notes owner read" on public.dog_notes;
drop policy if exists "dog notes staff all"  on public.dog_notes;

create policy "dog notes owner read"
  on public.dog_notes for select to authenticated
  using (exists (
    select 1 from public.dogs d
    where d.id = dog_notes.dog_id and d.owner_id = auth.uid()
  ));

create policy "dog notes staff all"
  on public.dog_notes for all to authenticated
  using (public.is_staff())
  with check (public.is_staff() and author_id = auth.uid());

-- ---------- stripe_events ----------
-- Only the service-role key (used in the webhook) should ever touch this table.
-- No policies for authenticated => no access.

-- Dixon Doggy Day Care: initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists "pgcrypto";

-- ---------- ENUMS ----------
do $$ begin
  create type user_role as enum ('customer', 'staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking_status as enum ('reserved', 'checked_in', 'checked_out', 'no_show', 'canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_kind as enum ('package', 'drop_in');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('unpaid', 'paid', 'refunded', 'failed');
exception when duplicate_object then null; end $$;

-- ---------- PROFILES ----------
-- One row per auth.users user. Holds role + contact info.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'customer',
  full_name text not null default '',
  email text not null,
  phone text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- DOGS ----------
create table if not exists public.dogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  breed text,
  sex text check (sex in ('male', 'female')),
  spayed_neutered boolean default false,
  date_of_birth date,
  weight_lbs numeric(5,1),
  color text,
  photo_path text, -- key inside the `dog-photos` storage bucket
  vet_name text,
  vet_phone text,
  vaccinations_current boolean default false,
  vaccination_notes text,
  allergies text,
  medications text,
  feeding_notes text,
  behavior_notes text, -- long-term notes by owner
  staff_notes text,    -- long-term notes by staff (only staff can edit)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dogs_owner_idx on public.dogs(owner_id);

-- ---------- WAIVERS ----------
-- A versioned waiver template. New version = new row, mark old inactive.
create table if not exists public.waivers (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  title text not null,
  body_markdown text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Each signature is immutable + tied to a waiver version.
create table if not exists public.waiver_signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  waiver_id uuid not null references public.waivers(id),
  signed_full_name text not null,
  ip_address inet,
  user_agent text,
  signed_at timestamptz not null default now()
);

create index if not exists waiver_signatures_user_idx on public.waiver_signatures(user_id);

-- ---------- PACKAGES ----------
-- Pre-purchased day passes the customer can redeem.
create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  days_included int not null check (days_included > 0),
  price_cents int not null check (price_cents >= 0),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- A package a customer has bought. days_remaining decrements as bookings are made.
create table if not exists public.customer_packages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  package_id uuid not null references public.packages(id),
  days_total int not null,
  days_remaining int not null,
  amount_paid_cents int not null,
  stripe_payment_intent_id text unique,
  stripe_checkout_session_id text unique,
  payment_status payment_status not null default 'unpaid',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (days_remaining >= 0 and days_remaining <= days_total)
);

create index if not exists customer_packages_customer_idx on public.customer_packages(customer_id);

-- ---------- BOOKINGS ----------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  service_date date not null,
  drop_off_time time,
  pickup_time time,
  status booking_status not null default 'reserved',

  -- payment source: either a customer_package (redeemed day) or a drop-in checkout
  payment_kind payment_kind not null,
  customer_package_id uuid references public.customer_packages(id),
  drop_in_price_cents int,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  payment_status payment_status not null default 'unpaid',

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    (payment_kind = 'package' and customer_package_id is not null and drop_in_price_cents is null)
    or
    (payment_kind = 'drop_in' and customer_package_id is null and drop_in_price_cents is not null)
  )
);

create index if not exists bookings_date_idx on public.bookings(service_date);
create index if not exists bookings_customer_idx on public.bookings(customer_id);
create index if not exists bookings_dog_idx on public.bookings(dog_id);
create unique index if not exists bookings_dog_date_uniq on public.bookings(dog_id, service_date) where status <> 'canceled';

-- ---------- CHECK-INS ----------
-- Operational log: when did the dog actually arrive / leave, who handled it.
create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles(id),
  checked_out_at timestamptz,
  checked_out_by uuid references public.profiles(id),
  arrival_notes text,
  departure_notes text
);

-- ---------- DAILY DOG NOTES (journal entries) ----------
create table if not exists public.dog_notes (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  author_id uuid not null references public.profiles(id),
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists dog_notes_dog_idx on public.dog_notes(dog_id, created_at desc);

-- ---------- STRIPE EVENT LOG (for webhook idempotency) ----------
create table if not exists public.stripe_events (
  id text primary key, -- Stripe event id
  type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

-- ---------- updated_at triggers ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists dogs_touch on public.dogs;
create trigger dogs_touch before update on public.dogs
  for each row execute function public.touch_updated_at();

drop trigger if exists bookings_touch on public.bookings;
create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();

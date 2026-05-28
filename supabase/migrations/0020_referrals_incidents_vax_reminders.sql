-- Referrals, incident log, and vaccine expiry reminders.
--
-- 1. Profile gets a short referral_code and an account_credit_cents balance.
-- 2. `referrals` joins referrer/referred and is "credited" when the referred
--    customer's first booking is paid (webhook does the credit and bump).
-- 3. `incidents` is a staff-only log (bite/injury/escape/etc.) with optional
--    photos in a private `incident-photos` bucket.
-- 4. dog_vaccinations gets a reminder_sent_at column so the expiry-reminder
--    cron only sends once.

-- ---------- profiles: referral + credit ----------
alter table public.profiles
  add column if not exists referral_code text unique;
alter table public.profiles
  add column if not exists account_credit_cents int not null default 0
    check (account_credit_cents >= 0);

create index if not exists profiles_referral_code_idx
  on public.profiles(referral_code);

-- Short, uppercase, URL-safe code (8 chars, ambiguous chars filtered).
create or replace function public.generate_referral_code() returns text
language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no I/O/0/1
  code text;
  i int;
begin
  code := '';
  for i in 1..8 loop
    code := code || substr(alphabet, 1 + (floor(random() * length(alphabet)))::int, 1);
  end loop;
  return code;
end;
$$;

-- Backfill any existing rows.
do $$
declare
  r record;
  new_code text;
begin
  for r in select id from public.profiles where referral_code is null loop
    loop
      new_code := public.generate_referral_code();
      begin
        update public.profiles set referral_code = new_code where id = r.id;
        exit;
      exception when unique_violation then
        -- collision, retry
      end;
    end loop;
  end loop;
end $$;

-- Refresh handle_new_user so freshly signed-up users get a code immediately.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  attempts int := 0;
  new_code text;
begin
  loop
    new_code := public.generate_referral_code();
    begin
      insert into public.profiles (id, email, full_name, referral_code)
      values (new.id, new.email,
              coalesce(new.raw_user_meta_data->>'full_name', ''),
              new_code);
      return new;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts > 5 then
        -- Last-ditch: insert without a code; UI will backfill.
        insert into public.profiles (id, email, full_name)
        values (new.id, new.email,
                coalesce(new.raw_user_meta_data->>'full_name', ''))
        on conflict (id) do nothing;
        return new;
      end if;
    end;
  end loop;
end;
$$;

-- ---------- referrals ----------
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'credited')),
  credit_cents int not null default 1000,
  credited_at timestamptz,
  created_at timestamptz not null default now(),
  check (referrer_id <> referred_id)
);

create index if not exists referrals_referrer_idx on public.referrals(referrer_id);
create index if not exists referrals_status_idx on public.referrals(status);

alter table public.referrals enable row level security;

drop policy if exists "referrals self read" on public.referrals;
drop policy if exists "referrals staff all" on public.referrals;

create policy "referrals self read"
  on public.referrals for select to authenticated
  using (referrer_id = auth.uid() or referred_id = auth.uid());

create policy "referrals staff all"
  on public.referrals for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- incidents ----------
do $$ begin
  create type incident_kind as enum
    ('bite', 'injury', 'escape', 'illness', 'property_damage', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type incident_severity as enum ('low', 'medium', 'high');
exception when duplicate_object then null; end $$;

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  occurred_on date not null,
  kind incident_kind not null,
  severity incident_severity not null default 'low',
  description text not null,
  reporter_id uuid references public.profiles(id),
  customer_notified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists incidents_dog_idx
  on public.incidents(dog_id, occurred_on desc);
create index if not exists incidents_occurred_idx
  on public.incidents(occurred_on desc);

alter table public.incidents enable row level security;

drop policy if exists "incidents staff all" on public.incidents;

create policy "incidents staff all"
  on public.incidents for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- incident photos ----------
create table if not exists public.incident_photos (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  storage_path text not null,
  caption text,
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz not null default now()
);

create index if not exists incident_photos_incident_idx
  on public.incident_photos(incident_id);

alter table public.incident_photos enable row level security;

drop policy if exists "incident photos staff all" on public.incident_photos;

create policy "incident photos staff all"
  on public.incident_photos for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Private bucket — staff-only, never public.
insert into storage.buckets (id, name, public)
values ('incident-photos', 'incident-photos', false)
on conflict (id) do nothing;

drop policy if exists "incident photos bucket staff all" on storage.objects;

create policy "incident photos bucket staff all"
  on storage.objects for all to authenticated
  using (bucket_id = 'incident-photos' and public.is_staff())
  with check (bucket_id = 'incident-photos' and public.is_staff());

-- ---------- vaccine expiry reminder tracking ----------
alter table public.dog_vaccinations
  add column if not exists reminder_sent_at timestamptz;

-- ---------- bookings: credit applied (per-booking, set at checkout time) ----
alter table public.bookings
  add column if not exists credit_applied_cents int not null default 0
    check (credit_applied_cents >= 0);

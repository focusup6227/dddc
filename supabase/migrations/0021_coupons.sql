-- Coupon codes (friends-and-family, etc.). A coupon is a fixed dollar
-- discount per booked day/night. Codes are stamped on the booking when the
-- customer applies them; the discount amount is frozen at apply-time so
-- later coupon edits don't retroactively change paid bookings.
--
-- Coupon vs account credit: at checkout we apply whichever yields the
-- bigger discount (never both — see bookings.server.ts).

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  discount_per_day_cents int not null check (discount_per_day_cents > 0),
  active boolean not null default true,
  expires_on date,
  created_at timestamptz not null default now()
);

create index if not exists coupons_code_idx on public.coupons(code);
create index if not exists coupons_active_idx on public.coupons(active);

alter table public.coupons enable row level security;

drop policy if exists "coupons staff all" on public.coupons;

-- Staff only — customers never read this table directly; server actions
-- look codes up with the service client.
create policy "coupons staff all"
  on public.coupons for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Bookings reference the applied coupon and snapshot the discount.
alter table public.bookings
  add column if not exists coupon_id uuid references public.coupons(id),
  add column if not exists coupon_discount_cents int not null default 0
    check (coupon_discount_cents >= 0);

create index if not exists bookings_coupon_idx on public.bookings(coupon_id);

-- Seed the friends-and-family code.
insert into public.coupons (code, description, discount_per_day_cents)
values ('FRIENDSFAMILY', 'Friends and family — $5 off per day/night', 500)
on conflict (code) do nothing;

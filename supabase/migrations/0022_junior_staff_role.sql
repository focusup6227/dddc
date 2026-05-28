-- Junior staff role: limited shift workers who can do daily ops (check-in,
-- chores, view schedule + dogs) but can't touch admin/financial/liability data.
--
-- After this migration, `is_staff()` returns true for BOTH 'staff' and
-- 'junior_staff' — so existing read policies grant access to both roles.
-- `is_full_staff()` is the new gate for admin writes. We tighten
-- INSERT/UPDATE/DELETE on the most sensitive tables to require it.

-- Add the new enum value.
alter type user_role add value if not exists 'junior_staff' before 'staff';

-- `is_staff()` now means "is any staff role". We compare role::text to dodge
-- the postgres rule about referencing just-added enum values in the same
-- transaction as the ALTER TYPE.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role::text in ('staff', 'junior_staff')
  );
$$;

-- `is_full_staff()` is the new senior-only check.
create or replace function public.is_full_staff()
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

grant execute on function public.is_full_staff() to authenticated;

-- ---------- Tighten senior-only writes ----------

-- incidents: liability log
drop policy if exists "incidents staff all" on public.incidents;
create policy "incidents staff read"
  on public.incidents for select to authenticated
  using (public.is_staff());
create policy "incidents senior write"
  on public.incidents for insert to authenticated
  with check (public.is_full_staff());
create policy "incidents senior update"
  on public.incidents for update to authenticated
  using (public.is_full_staff())
  with check (public.is_full_staff());
create policy "incidents senior delete"
  on public.incidents for delete to authenticated
  using (public.is_full_staff());

drop policy if exists "incident photos staff all" on public.incident_photos;
create policy "incident photos staff read"
  on public.incident_photos for select to authenticated
  using (public.is_staff());
create policy "incident photos senior write"
  on public.incident_photos for insert to authenticated
  with check (public.is_full_staff());
create policy "incident photos senior update"
  on public.incident_photos for update to authenticated
  using (public.is_full_staff())
  with check (public.is_full_staff());
create policy "incident photos senior delete"
  on public.incident_photos for delete to authenticated
  using (public.is_full_staff());

-- coupons
drop policy if exists "coupons staff all" on public.coupons;
create policy "coupons staff read"
  on public.coupons for select to authenticated
  using (public.is_staff());
create policy "coupons senior write"
  on public.coupons for insert to authenticated
  with check (public.is_full_staff());
create policy "coupons senior update"
  on public.coupons for update to authenticated
  using (public.is_full_staff())
  with check (public.is_full_staff());
create policy "coupons senior delete"
  on public.coupons for delete to authenticated
  using (public.is_full_staff());

-- referrals (writes by service client in webhook; tighten human-touch paths)
drop policy if exists "referrals staff all" on public.referrals;
create policy "referrals staff read all"
  on public.referrals for select to authenticated
  using (public.is_staff());
create policy "referrals senior write"
  on public.referrals for update to authenticated
  using (public.is_full_staff())
  with check (public.is_full_staff());
create policy "referrals senior delete"
  on public.referrals for delete to authenticated
  using (public.is_full_staff());

-- profiles: junior staff cannot change roles or other people's profiles
drop policy if exists "profiles staff update" on public.profiles;
create policy "profiles senior staff update"
  on public.profiles for update to authenticated
  using (public.is_full_staff())
  with check (public.is_full_staff());

-- waivers (template management)
drop policy if exists "waivers staff write" on public.waivers;
create policy "waivers senior write"
  on public.waivers for all to authenticated
  using (public.is_full_staff())
  with check (public.is_full_staff());

-- packages catalog
drop policy if exists "packages staff write" on public.packages;
create policy "packages senior write"
  on public.packages for all to authenticated
  using (public.is_full_staff())
  with check (public.is_full_staff());

-- events (customer-facing — read stays public)
drop policy if exists "events staff write" on public.events;
create policy "events senior write"
  on public.events for all to authenticated
  using (public.is_full_staff())
  with check (public.is_full_staff());

-- blackouts (capacity / closures — read stays public)
drop policy if exists "blackouts staff write" on public.blackouts;
create policy "blackouts senior write"
  on public.blackouts for all to authenticated
  using (public.is_full_staff())
  with check (public.is_full_staff());

-- settings table
drop policy if exists "settings staff write" on public.settings;
create policy "settings senior write"
  on public.settings for all to authenticated
  using (public.is_full_staff())
  with check (public.is_full_staff());

-- dog_vaccinations: junior can read (to check status), senior verifies/rejects
drop policy if exists "vax staff all" on public.dog_vaccinations;
create policy "vax staff read"
  on public.dog_vaccinations for select to authenticated
  using (public.is_staff());
create policy "vax senior update"
  on public.dog_vaccinations for update to authenticated
  using (public.is_full_staff())
  with check (public.is_full_staff());
create policy "vax senior delete"
  on public.dog_vaccinations for delete to authenticated
  using (public.is_full_staff());

-- report_cards: junior can view existing, senior writes
drop policy if exists "report cards staff all" on public.report_cards;
create policy "report cards staff read"
  on public.report_cards for select to authenticated
  using (
    public.is_staff()
    or (
      published_at is not null
      and exists (
        select 1 from public.bookings b
        where b.id = report_cards.booking_id and b.customer_id = auth.uid()
      )
    )
  );
create policy "report cards senior write"
  on public.report_cards for insert to authenticated
  with check (public.is_full_staff());
create policy "report cards senior update"
  on public.report_cards for update to authenticated
  using (public.is_full_staff())
  with check (public.is_full_staff());
create policy "report cards senior delete"
  on public.report_cards for delete to authenticated
  using (public.is_full_staff());

drop policy if exists "report card photos staff all" on public.report_card_photos;
create policy "report card photos staff read"
  on public.report_card_photos for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1
      from public.report_cards rc
      join public.bookings b on b.id = rc.booking_id
      where rc.id = report_card_photos.report_card_id
        and rc.published_at is not null
        and b.customer_id = auth.uid()
    )
  );
create policy "report card photos senior write"
  on public.report_card_photos for insert to authenticated
  with check (public.is_full_staff());
create policy "report card photos senior update"
  on public.report_card_photos for update to authenticated
  using (public.is_full_staff())
  with check (public.is_full_staff());
create policy "report card photos senior delete"
  on public.report_card_photos for delete to authenticated
  using (public.is_full_staff());

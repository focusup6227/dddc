-- Pricing update (2026-05-28):
--   * Daycare drop-in: $25/day
--   * 5-Day Pack: $115 ($23/day)
--   * 10-Day Pack: $210 ($21/day)
-- Also makes the active package catalog publicly readable so the
-- marketing homepage can show prices to anonymous visitors.

-- ---------- Public read of active packages ----------
drop policy if exists "packages read public" on public.packages;
create policy "packages read public"
  on public.packages for select to anon
  using (active);

-- ---------- Deactivate prior seed packages ----------
-- Matches the rows inserted in 0004_seed.sql. Done by (name, days_included,
-- price_cents) so we don't touch anything operators have created manually
-- with the same display name.
update public.packages
   set active = false
 where (name = 'Single Day Drop-In' and days_included = 1  and price_cents = 4500)
    or (name = '5-Day Pack'         and days_included = 5  and price_cents = 20250)
    or (name = '10-Day Pack'        and days_included = 10 and price_cents = 38250)
    or (name = '20-Day Pack'        and days_included = 20 and price_cents = 72000);

-- ---------- Insert new pricing ----------
-- Each insert is guarded so re-running the migration is safe.
insert into public.packages (name, description, days_included, price_cents, sort_order, active)
select 'Single Day Drop-In', 'One day of day care.', 1, 2500, 0, true
 where not exists (
   select 1 from public.packages
    where name = 'Single Day Drop-In' and days_included = 1 and price_cents = 2500
 );

insert into public.packages (name, description, days_included, price_cents, sort_order, active)
select '5-Day Pack', 'Five days of day care. $23/day.', 5, 11500, 1, true
 where not exists (
   select 1 from public.packages
    where name = '5-Day Pack' and days_included = 5 and price_cents = 11500
 );

insert into public.packages (name, description, days_included, price_cents, sort_order, active)
select '10-Day Pack', 'Ten days of day care. $21/day.', 10, 21000, 2, true
 where not exists (
   select 1 from public.packages
    where name = '10-Day Pack' and days_included = 10 and price_cents = 21000
 );

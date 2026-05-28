-- Hybrid Stripe catalog: each package row points at a pre-created
-- Stripe Product + Price so checkouts can reference them by ID
-- (cleaner reporting in the Stripe dashboard) while the staff UI can
-- still own the catalog. New rows created via the staff UI will have
-- these fields populated by the server action; rows without IDs fall
-- back to ad-hoc price_data at checkout.

alter table public.packages
  add column if not exists stripe_product_id text,
  add column if not exists stripe_price_id   text;

-- Backfill the three packages seeded in 0009_pricing_update.sql with
-- the live-mode IDs created via the Stripe MCP on 2026-05-28.
update public.packages
   set stripe_product_id = 'prod_Ub9NpwBf7QeRaj',
       stripe_price_id   = 'price_1Tbx4UIt0IEhgtKT9ISdoo1e'
 where active
   and name = 'Single Day Drop-In'
   and days_included = 1
   and price_cents = 2500;

update public.packages
   set stripe_product_id = 'prod_Ub9XscKcXxknHC',
       stripe_price_id   = 'price_1TbxENIt0IEhgtKTqeBNtnlX'
 where active
   and name = '5-Day Pack'
   and days_included = 5
   and price_cents = 11500;

update public.packages
   set stripe_product_id = 'prod_Ub9Xw23gIv1Ug1',
       stripe_price_id   = 'price_1TbxENIt0IEhgtKTBEbiiwlR'
 where active
   and name = '10-Day Pack'
   and days_included = 10
   and price_cents = 21000;

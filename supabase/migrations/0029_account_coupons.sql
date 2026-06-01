-- Account-level coupon: a coupon attached to a customer so its per-day/night
-- discount auto-applies to their bookings without typing a code. A BEFORE
-- INSERT trigger stamps the coupon onto each new eligible booking (unpaid,
-- chargeable, not already couponed), reusing the same coupon_id /
-- coupon_discount_cents columns a typed code uses — so all downstream
-- checkout, display, and refund logic works unchanged. Existing open bookings
-- are stamped in app code when staff attach the coupon.

alter table public.profiles
  add column if not exists account_coupon_id uuid
    references public.coupons(id) on delete set null;

create or replace function public.apply_account_coupon()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cpn public.coupons%rowtype;
  units int;
  disc int;
begin
  -- Only auto-stamp chargeable, un-couponed, unpaid bookings.
  if NEW.coupon_id is not null then return NEW; end if;
  if NEW.payment_kind = 'package' then return NEW; end if;
  if NEW.payment_status is distinct from 'unpaid' then return NEW; end if;

  select c.* into cpn
  from public.profiles p
  join public.coupons c on c.id = p.account_coupon_id
  where p.id = NEW.customer_id
    and c.active
    and (c.expires_on is null or c.expires_on >= current_date);
  if not found then return NEW; end if;

  -- Boarding charges per night; daycare is a single day.
  if NEW.service_kind = 'boarding' then
    units := greatest(1, (NEW.service_end_date - NEW.service_date));
  else
    units := 1;
  end if;

  disc := cpn.discount_per_day_cents * units;
  if NEW.unit_price_cents is not null then
    disc := least(disc, NEW.unit_price_cents * units);
  end if;

  NEW.coupon_id := cpn.id;
  NEW.coupon_discount_cents := greatest(0, disc);
  return NEW;
end$$;

drop trigger if exists trg_apply_account_coupon on public.bookings;
create trigger trg_apply_account_coupon
  before insert on public.bookings
  for each row execute function public.apply_account_coupon();

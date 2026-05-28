-- Track cancellation + refund details on bookings.
-- canceled_by is the actor who initiated the cancel (customer or staff).
-- refund_amount_cents = 0 means no money moved (unpaid booking or package-funded
-- where the package day was returned instead of issuing cash).
alter table public.bookings
  add column if not exists canceled_at timestamptz,
  add column if not exists canceled_by uuid references public.profiles(id),
  add column if not exists cancellation_reason text,
  add column if not exists refund_amount_cents int,
  add column if not exists stripe_refund_id text;

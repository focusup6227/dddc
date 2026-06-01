-- Track how many package days each booking consumed, so a cancellation can
-- restore the EXACT amount. With partial redemption a day can be funded by a
-- fraction of a package day (e.g. 0.5 package + $12.50 cash), and previously
-- cancelling such a day refunded the cash but stranded the consumed fraction.
--
-- Values: 1.0 for a fully package-funded day, the consumed fraction (e.g. 0.5)
-- for a partially-funded day, 0 for a pure cash drop-in.

alter table public.bookings
  add column if not exists package_days_used numeric(3,1) not null default 0;

-- Backfill: every existing package-funded booking consumed exactly one day.
-- (Partial days didn't exist before this change, so cash drop-ins stay 0.)
update public.bookings
  set package_days_used = 1
  where payment_kind = 'package' and package_days_used = 0;

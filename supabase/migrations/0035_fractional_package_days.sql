-- Fractional package days. A within-24h self-reschedule of a package-funded
-- day-care booking debits a HALF day from the package as a late-change penalty
-- (the booking keeps its day on the new date; the extra 0.5 day is the fee).
-- days_remaining therefore needs to hold fractions like 2.5.
--
-- days_total stays whole (packages are always sold in whole days). Booking a
-- day still debits a full 1.0; only the reschedule penalty introduces halves.
-- The booking allocators were updated to require >= 1 remaining before funding
-- a full day, so a sub-1 balance can't be over-allocated.

alter table public.customer_packages
  alter column days_remaining type numeric(6,1) using days_remaining::numeric;

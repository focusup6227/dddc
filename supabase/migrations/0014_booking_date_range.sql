-- Switch bookings to a date range model: each row covers [service_date, service_end_date).
-- Daycare stays span exactly one day (service_end_date = service_date + 1).
-- Boarding stays span N nights as a single row, replacing the previous
-- "one row per night" representation.

alter table public.bookings add column if not exists service_end_date date;

-- Dedupe existing boarding rows: group by checkout session (each session_id
-- represents one stay), keep the row with the earliest service_date, set
-- its service_end_date to (latest service_date in the group) + 1, then
-- delete the other rows in the group.
with stay_bounds as (
  select
    coalesce(stripe_checkout_session_id, id::text) as stay_key,
    max(service_date) + 1 as end_date
  from public.bookings
  where service_kind = 'boarding' and service_end_date is null
  group by coalesce(stripe_checkout_session_id, id::text)
),
keepers as (
  select distinct on (coalesce(stripe_checkout_session_id, id::text)) id
  from public.bookings
  where service_kind = 'boarding' and service_end_date is null
  order by coalesce(stripe_checkout_session_id, id::text), service_date
)
update public.bookings b
set service_end_date = sb.end_date
from stay_bounds sb, keepers k
where b.id = k.id
  and coalesce(b.stripe_checkout_session_id, b.id::text) = sb.stay_key;

delete from public.bookings
where service_kind = 'boarding' and service_end_date is null;

-- Daycare and any remaining rows: a one-day span.
update public.bookings
set service_end_date = service_date + 1
where service_end_date is null;

alter table public.bookings alter column service_end_date set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bookings'::regclass
       and conname = 'bookings_dates_check'
  ) then
    alter table public.bookings
      add constraint bookings_dates_check check (service_end_date > service_date);
  end if;
end $$;

create index if not exists bookings_end_date_idx on public.bookings(service_end_date);

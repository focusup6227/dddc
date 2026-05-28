-- Rename bookings.drop_in_price_cents -> unit_price_cents. The column now
-- holds either a daycare drop-in rate or a boarding nightly rate, so the
-- old name was misleading. Postgres updates the CHECK constraint
-- references automatically.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'bookings'
       and column_name = 'drop_in_price_cents'
  ) then
    alter table public.bookings rename column drop_in_price_cents to unit_price_cents;
  end if;
end $$;

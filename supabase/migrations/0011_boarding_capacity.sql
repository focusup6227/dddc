-- Boarding vs. daycare capacity. Two daily caps because boarding has
-- a much smaller bed count than the daycare floor. Bookings get tagged
-- with service_kind so the capacity check can filter to the right pool.

do $$ begin
  create type service_kind as enum ('daycare', 'boarding');
exception when duplicate_object then null;
end $$;

alter table public.bookings
  add column if not exists service_kind service_kind not null default 'daycare';

-- Default boarding capacity. Editable in /staff/settings.
insert into public.settings (key, value)
values ('max_dogs_per_night', '5')
on conflict (key) do nothing;

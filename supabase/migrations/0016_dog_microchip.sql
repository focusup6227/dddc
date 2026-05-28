-- Optional microchip info on dogs.

alter table public.dogs
  add column if not exists microchipped boolean not null default false,
  add column if not exists microchip_number text;

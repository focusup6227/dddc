-- Simple key/value settings table for things like daily capacity.
create table if not exists public.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

drop policy if exists "settings read all" on public.settings;
create policy "settings read all"
  on public.settings for select
  using (true);

drop policy if exists "settings staff write" on public.settings;
create policy "settings staff write"
  on public.settings for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'staff'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'staff'));

-- Default daily capacity. Tweak in /staff/settings or via SQL.
insert into public.settings (key, value)
values ('max_dogs_per_day', '30')
on conflict (key) do nothing;

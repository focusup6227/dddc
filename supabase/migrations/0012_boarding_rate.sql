-- Default boarding rate. Editable in /staff/settings.
insert into public.settings (key, value)
values ('boarding_rate_cents', '3000')
on conflict (key) do nothing;

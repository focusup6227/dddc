-- Storage bucket for dog photos + RLS for it.
-- Run after 0002_rls.sql.

insert into storage.buckets (id, name, public)
values ('dog-photos', 'dog-photos', true)
on conflict (id) do nothing;

-- Storage policies live on the storage.objects table.
drop policy if exists "dog photos public read"     on storage.objects;
drop policy if exists "dog photos owner write"     on storage.objects;
drop policy if exists "dog photos owner update"    on storage.objects;
drop policy if exists "dog photos owner delete"    on storage.objects;
drop policy if exists "dog photos staff write"     on storage.objects;

-- Public read of the bucket (so <img src> works without signed URLs).
create policy "dog photos public read"
  on storage.objects for select
  using (bucket_id = 'dog-photos');

-- Owner can upload/update/delete photos for their own dogs.
-- Photos are stored under "<owner_id>/<dog_id>/<filename>" by the app.
create policy "dog photos owner write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dog-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "dog photos owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'dog-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "dog photos owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'dog-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Staff can write/update/delete any dog photo.
create policy "dog photos staff write"
  on storage.objects for all to authenticated
  using (bucket_id = 'dog-photos' and public.is_staff())
  with check (bucket_id = 'dog-photos' and public.is_staff());

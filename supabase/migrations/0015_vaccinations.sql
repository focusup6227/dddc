-- Per-dog vaccination records: customers upload a document + expiration date
-- for each required vaccine; staff reviews and marks verified or rejected.
-- A booking is only allowed once all required vaccines are verified and
-- non-expired as of the service date.

do $$ begin
  create type vaccination_status as enum ('pending', 'verified', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.dog_vaccinations (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  vaccine_type text not null check (vaccine_type in ('rabies', 'dhpp', 'bordetella')),
  document_path text not null, -- key inside the private `vaccine-records` bucket
  expires_on date not null,
  status vaccination_status not null default 'pending',
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles(id),
  verified_at timestamptz,
  verified_by uuid references public.profiles(id),
  rejection_reason text
);

create index if not exists dog_vaccinations_dog_idx on public.dog_vaccinations(dog_id);
create index if not exists dog_vaccinations_pending_idx
  on public.dog_vaccinations(uploaded_at)
  where status = 'pending';

alter table public.dog_vaccinations enable row level security;

drop policy if exists "vax owner select"  on public.dog_vaccinations;
drop policy if exists "vax owner insert"  on public.dog_vaccinations;
drop policy if exists "vax owner delete"  on public.dog_vaccinations;
drop policy if exists "vax staff all"     on public.dog_vaccinations;

-- Customer can see + upload + delete records for their own dogs.
-- They cannot update (no fraud edits): re-upload creates a fresh row.
create policy "vax owner select"
  on public.dog_vaccinations for select to authenticated
  using (exists (
    select 1 from public.dogs d
    where d.id = dog_vaccinations.dog_id and d.owner_id = auth.uid()
  ));

create policy "vax owner insert"
  on public.dog_vaccinations for insert to authenticated
  with check (
    status = 'pending'
    and exists (
      select 1 from public.dogs d
      where d.id = dog_vaccinations.dog_id and d.owner_id = auth.uid()
    )
  );

create policy "vax owner delete"
  on public.dog_vaccinations for delete to authenticated
  using (exists (
    select 1 from public.dogs d
    where d.id = dog_vaccinations.dog_id and d.owner_id = auth.uid()
  ));

create policy "vax staff all"
  on public.dog_vaccinations for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- Storage bucket (private) ----------
insert into storage.buckets (id, name, public)
values ('vaccine-records', 'vaccine-records', false)
on conflict (id) do nothing;

drop policy if exists "vaccine records owner read"   on storage.objects;
drop policy if exists "vaccine records owner write"  on storage.objects;
drop policy if exists "vaccine records owner delete" on storage.objects;
drop policy if exists "vaccine records staff all"    on storage.objects;

-- Path layout: "<owner_id>/<dog_id>/<vaccine_type>/<timestamp>.<ext>"
create policy "vaccine records owner read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'vaccine-records'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "vaccine records owner write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vaccine-records'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "vaccine records owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vaccine-records'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "vaccine records staff all"
  on storage.objects for all to authenticated
  using (bucket_id = 'vaccine-records' and public.is_staff())
  with check (bucket_id = 'vaccine-records' and public.is_staff());

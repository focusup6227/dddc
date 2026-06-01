-- Multi-dog incidents. A single event — most obviously a scuffle or bite —
-- can involve more than one dog, and each dog's owner should be notified. The
-- original model tied an incident to exactly one dog via incidents.dog_id.
--
-- We introduce a junction table so one incident can list several dogs, while
-- keeping incidents.dog_id as the "primary" dog (the first one selected). The
-- primary keeps existing indexes/queries cheap and gives every incident a
-- stable headline dog; the junction is the source of truth for "who was
-- involved" and drives owner notifications and per-dog history.

create table if not exists public.incident_dogs (
  incident_id uuid not null references public.incidents(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  primary key (incident_id, dog_id)
);

create index if not exists incident_dogs_dog_idx
  on public.incident_dogs(dog_id);
create index if not exists incident_dogs_incident_idx
  on public.incident_dogs(incident_id);

-- Backfill: every existing incident's single dog becomes its first (and only)
-- junction row. Idempotent — safe to re-run.
insert into public.incident_dogs (incident_id, dog_id)
  select id, dog_id from public.incidents
  on conflict do nothing;

alter table public.incident_dogs enable row level security;

drop policy if exists "incident_dogs staff all" on public.incident_dogs;

create policy "incident_dogs staff all"
  on public.incident_dogs for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

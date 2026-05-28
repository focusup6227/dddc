-- Chores: a flat table holding three flavors of row
--   1. Concrete chore instances (due_date set, completed_at tracks state)
--   2. Manual recurring templates (recurrence in ('daily','weekly'),
--      due_date null, never shown as a chore itself — spawns instances)
--   3. Auto-generated instances (auto_key set so re-generation is idempotent)
--
-- "kind" tags the source for grouping in the UI.

do $$ begin
  create type chore_kind as enum ('walk', 'sanitize', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type chore_recurrence as enum ('none', 'daily', 'weekly');
exception when duplicate_object then null; end $$;

create table if not exists public.chores (
  id uuid primary key default gen_random_uuid(),
  kind chore_kind not null,
  title text not null,
  description text,
  due_date date,
  dog_id uuid references public.dogs(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  -- Idempotency key for auto-generated rows. Conventions:
  --   walk_am / walk_pm                (dog_id set)
  --   sanitize_backyard                (no dog_id)
  --   sanitize_kennel:<booking_id>     (dog_id set)
  --   template:<template_chore_id>     (any)
  auto_key text,
  parent_chore_id uuid references public.chores(id) on delete cascade,
  recurrence chore_recurrence not null default 'none',
  weekday smallint check (weekday between 0 and 6),
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (
    (recurrence = 'none' and due_date is not null and parent_chore_id is null)
    or
    (recurrence in ('daily','weekly') and due_date is null and parent_chore_id is null and completed_at is null)
  )
);

create index if not exists chores_due_idx on public.chores(due_date) where due_date is not null;
create index if not exists chores_template_idx on public.chores(recurrence) where recurrence <> 'none';
create index if not exists chores_dog_idx on public.chores(dog_id);

create unique index if not exists chores_auto_uniq
  on public.chores(due_date, auto_key, coalesce(dog_id::text, ''))
  where auto_key is not null;

alter table public.chores enable row level security;

drop policy if exists "chores staff all" on public.chores;
create policy "chores staff all"
  on public.chores for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

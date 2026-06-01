-- Expo push tokens for the staff mobile app. One row per device; a staff
-- member may have several (phone, tablet). The server sends to every token
-- via the Expo Push API on the events staff opted into.

create table if not exists public.staff_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_push_tokens_user_idx
  on public.staff_push_tokens(user_id);

alter table public.staff_push_tokens enable row level security;

drop policy if exists "push tokens self" on public.staff_push_tokens;
drop policy if exists "push tokens staff all" on public.staff_push_tokens;

create policy "push tokens self"
  on public.staff_push_tokens for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "push tokens staff all"
  on public.staff_push_tokens for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Dog report cards: a cute note + photos from a stay, written by staff
-- and shared with the customer once published.
--
-- One card per booking. published_at gates customer visibility AND the
-- "report card ready" email (sent on the transition to published).

create table if not exists public.report_cards (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  note text not null default '',
  published_at timestamptz,
  published_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists report_cards_booking_idx on public.report_cards(booking_id);
create index if not exists report_cards_published_idx on public.report_cards(published_at desc);

-- Each photo belongs to a card. photo_date is optional — when set, the
-- customer view groups photos into a per-day timeline; when null, photos
-- just render in sort_order.
create table if not exists public.report_card_photos (
  id uuid primary key default gen_random_uuid(),
  report_card_id uuid not null references public.report_cards(id) on delete cascade,
  storage_path text not null, -- key inside the `report-card-photos` bucket
  caption text,
  photo_date date,
  sort_order int not null default 0,
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz not null default now()
);

create index if not exists report_card_photos_card_idx
  on public.report_card_photos(report_card_id, sort_order, uploaded_at);

drop trigger if exists report_cards_touch on public.report_cards;
create trigger report_cards_touch before update on public.report_cards
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.report_cards         enable row level security;
alter table public.report_card_photos   enable row level security;

-- Card: customer can read their own published card; staff full access.
drop policy if exists "report cards owner read"   on public.report_cards;
drop policy if exists "report cards staff all"    on public.report_cards;

create policy "report cards owner read"
  on public.report_cards for select to authenticated
  using (
    published_at is not null
    and exists (
      select 1 from public.bookings b
      where b.id = report_cards.booking_id and b.customer_id = auth.uid()
    )
  );

create policy "report cards staff all"
  on public.report_cards for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Photos: visible if the parent card is visible to the user.
drop policy if exists "report card photos owner read" on public.report_card_photos;
drop policy if exists "report card photos staff all"  on public.report_card_photos;

create policy "report card photos owner read"
  on public.report_card_photos for select to authenticated
  using (exists (
    select 1
    from public.report_cards rc
    join public.bookings b on b.id = rc.booking_id
    where rc.id = report_card_photos.report_card_id
      and rc.published_at is not null
      and b.customer_id = auth.uid()
  ));

create policy "report card photos staff all"
  on public.report_card_photos for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('report-card-photos', 'report-card-photos', true)
on conflict (id) do nothing;

drop policy if exists "report card photos public read" on storage.objects;
drop policy if exists "report card photos staff write" on storage.objects;

-- Public read so <img> works without signed URLs. (The DB row gates whether
-- the customer ever learns the path — unpublished cards aren't surfaced.)
create policy "report card photos public read"
  on storage.objects for select
  using (bucket_id = 'report-card-photos');

-- Only staff can write/update/delete. Customers don't upload here.
create policy "report card photos staff write"
  on storage.objects for all to authenticated
  using (bucket_id = 'report-card-photos' and public.is_staff())
  with check (bucket_id = 'report-card-photos' and public.is_staff());

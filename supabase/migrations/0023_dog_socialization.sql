-- Health issues, socialization preferences, and free-form owner notes on dogs.

alter table public.dogs
  add column if not exists health_issues text,
  add column if not exists gets_along_with text[] not null default '{}',
  add column if not exists additional_notes text;

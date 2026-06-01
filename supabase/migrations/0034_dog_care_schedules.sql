-- Structured feeding & medication schedules. The free-text feeding_notes /
-- medications columns are easy for owners to fill in but vague for staff —
-- "2 cups morning and night, plus a pill" doesn't translate into clear,
-- checkable tasks. These JSONB columns hold itemized entries (a time plus an
-- instruction) so the chore generator can emit one task per feeding/dose.
--
-- Shapes:
--   feeding_schedule:    [{ "time": "08:00", "amount": "1 cup kibble" }, ...]
--   medication_schedule: [{ "time": "08:00", "name": "Rimadyl", "dose": "1 tablet" }, ...]
--
-- The free-text columns stay as the fallback (and a place for general notes):
-- when a structured schedule is empty, chore generation uses the old behavior.

alter table public.dogs
  add column if not exists feeding_schedule jsonb not null default '[]'::jsonb;

alter table public.dogs
  add column if not exists medication_schedule jsonb not null default '[]'::jsonb;

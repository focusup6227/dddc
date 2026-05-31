-- Per-stay feeding & medication tracking, built on the chores system.
-- Two new chore kinds, auto-generated daily for boarding dogs:
--   feeding    — Breakfast + Dinner per boarder (feeding_notes in description)
--   medication — one "give meds" task per boarder that has medications on file
-- Completion records who + when via the existing completed_by/completed_at,
-- and rolls into the per-staff weekly activity view.

alter type chore_kind add value if not exists 'feeding';
alter type chore_kind add value if not exists 'medication';

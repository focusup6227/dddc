-- Fix: materialized template-instance chores legitimately carry a
-- parent_chore_id (pointing at the recurring template they were spawned from)
-- while being concrete instances (recurrence='none', due_date set). The
-- original chores_check forbade parent_chore_id on concrete rows, so inserting
-- a template instance failed the constraint. Because ensureAutoChoresForDate
-- inserts walks + sanitize + template instances in one atomic batch, that
-- failure aborted the whole insert and silently dropped the auto-generated
-- walk chores for checked-in dogs.
--
-- Allow concrete instances to optionally reference a parent template. Templates
-- themselves still must not have a parent.

alter table public.chores drop constraint if exists chores_check;

alter table public.chores add constraint chores_check check (
  (recurrence = 'none' and due_date is not null)
  or
  (recurrence in ('daily','weekly') and due_date is null and parent_chore_id is null and completed_at is null)
);

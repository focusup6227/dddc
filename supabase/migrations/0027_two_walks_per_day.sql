-- Reduce auto walks from three per day (morning/afternoon/evening) to two
-- (11:30 AM = walk_am, 7:30 PM = walk_pm). The generator no longer emits
-- walk_eve, but rows may already exist for today/future dates.
--
-- Remove only still-pending evening walks from today onward so the extra
-- third walk disappears from the chores list. Completed historical walk_eve
-- rows are left intact as an accurate record of work already done.
delete from public.chores
where auto_key = 'walk_eve'
  and status = 'pending'
  and due_date >= current_date;

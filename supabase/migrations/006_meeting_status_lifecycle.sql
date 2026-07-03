-- ============================================================
-- BoardOS 006 — Meeting status lifecycle (4 states -> 8)
-- Run this in the Supabase SQL editor AFTER 001-005.
-- ============================================================
--
-- Old: scheduled, draft_minutes, approved, cancelled
-- New: draft, agenda_open, agenda_locked, scheduled, held,
--      minutes_drafted, minutes_approved, cancelled
--
-- 'cancelled' is kept as an 8th terminal side-branch (an escape hatch,
-- reachable from any non-terminal status), not folded into the linear
-- pipeline — a cancelled draft and a cancelled scheduled meeting are
-- different things and shouldn't be conflated into one lifecycle slot.
--
-- Data migration note: 'approved' rows have final_minutes already
-- populated, which structurally matches 'minutes_approved' (not merely
-- 'held' — a meeting can be Held without its minutes being approved yet).
-- This maps old 'approved' -> new 'minutes_approved'.

alter table meetings drop constraint if exists meetings_status_check;

update meetings set status = 'minutes_drafted' where status = 'draft_minutes';
update meetings set status = 'minutes_approved' where status = 'approved';
-- 'scheduled' and 'cancelled' need no data change — both names are reused as-is.

alter table meetings add constraint meetings_status_check check (status in (
  'draft', 'agenda_open', 'agenda_locked', 'scheduled', 'held',
  'minutes_drafted', 'minutes_approved', 'cancelled'
));

alter table meetings add column if not exists agenda_deadline timestamptz;

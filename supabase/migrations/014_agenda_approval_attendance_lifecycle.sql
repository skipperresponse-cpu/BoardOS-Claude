-- ============================================================
-- BoardOS 014 — Agenda auto-approval, external attendees, meeting
-- start/close lifecycle
-- Single-tenant only.
-- ============================================================

-- ------------------------------------------------------------
-- AGENDA ITEMS — add 'discussed' status, set at Close Meeting time for
-- approved items that were actually covered. Distinct from 'approved'
-- (reviewed, on the agenda) and 'deferred' (never got to it, rolled
-- forward) — this is "the meeting actually discussed it."
-- ------------------------------------------------------------
alter table agenda_items drop constraint if exists agenda_items_status_check;
alter table agenda_items add constraint agenda_items_status_check check (status in
  ('submitted', 'approved', 'edited_approved', 'discussed', 'deferred', 'rejected', 'pending', 'noted'));

-- ------------------------------------------------------------
-- MEETING ATTENDEES — required/optional distinction (Task 3/4's absentee
-- logic), and support for external (non-system) subcommittee members as
-- attendees — they have no profile row, so user_id becomes nullable and
-- subcommittee_member_id (pointing back to the standing roster entry that
-- carries their name/affiliation/email) fills in for external people.
-- Exactly one of the two must be set per row.
-- ------------------------------------------------------------
alter table meeting_attendees
  add column if not exists attendance_requirement text not null default 'required'
    check (attendance_requirement in ('required', 'optional')),
  add column if not exists subcommittee_member_id uuid references subcommittee_members(id) on delete cascade;

alter table meeting_attendees alter column user_id drop not null;

alter table meeting_attendees drop constraint if exists meeting_attendees_internal_xor_external;
alter table meeting_attendees add constraint meeting_attendees_internal_xor_external check (
  (user_id is not null and subcommittee_member_id is null)
  or (user_id is null and subcommittee_member_id is not null)
);

-- The original unique(meeting_id, user_id) already exists and still holds for
-- internal attendees (NULLs don't collide in a unique index, so it doesn't
-- block multiple external rows). Add the matching guard for external ones.
alter table meeting_attendees drop constraint if exists meeting_attendees_unique_external;
alter table meeting_attendees add constraint meeting_attendees_unique_external
  unique (meeting_id, subcommittee_member_id);

-- ------------------------------------------------------------
-- MEETINGS — is_in_progress distinguishes an actively-running meeting from
-- one that has been formally closed, both while status = 'held'. Start
-- Meeting sets this true (alongside the existing scheduled -> held
-- transition); Close Meeting sets it false without changing status —
-- minutes drafting then proceeds exactly as before via the existing
-- held -> minutes_drafted transition.
-- ------------------------------------------------------------
alter table meetings
  add column if not exists is_in_progress boolean not null default false;

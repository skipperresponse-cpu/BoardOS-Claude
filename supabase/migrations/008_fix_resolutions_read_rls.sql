-- ============================================================
-- BoardOS 008 — Fix resolutions read RLS gap
-- Run this in the Supabase SQL editor AFTER 001-007.
-- ============================================================
--
-- SYMPTOM: an administrator who creates/circulates a resolution (permitted
-- via canFlagForResolution) gets a 404 on the resolution's own detail page.
--
-- ROOT CAUSE: the read policy from 007 only covered admin_equivalent + board
-- tiers, but administrator can create/circulate resolutions per the
-- confirmed design (non-board operational staff, e.g. the ED). They were
-- never granted read access to the resolutions they're allowed to create.

drop policy if exists "Admin-equivalent and board read resolutions" on resolutions;

create policy "Admin-equivalent, board, and administrator read resolutions"
  on resolutions for select
  using (current_user_role_tier() in ('admin_equivalent', 'board', 'administrator'));

-- ============================================================
-- BoardOS 005 — Expand roles (3 -> 7) + tier-based RLS rewrite
-- Run this in the Supabase SQL editor AFTER 001, 002, 003, 004.
-- Single-tenant only.
-- ============================================================
--
-- New roles: president, secretary (admin-equivalent — same access as old 'admin'),
-- treasurer (label only, same tier as board_member), board_member (unchanged),
-- administrator (NEW tier: full CRUD on documents/meetings/action items, but
-- CANNOT vote on approvals and CANNOT do the agenda-review sign-off step —
-- represents non-board operational staff e.g. an Executive Director),
-- advisor (narrow: submit agenda items + assignable to action items only,
-- same document/meeting visibility restriction as viewer for documents),
-- viewer (unchanged).
--
-- IMPORTANT: current_user_role_tier() is SECURITY DEFINER and MUST set
-- search_path explicitly — this is the exact bug fixed in migration 004
-- (supabase_auth_admin's search_path does not include public; the same risk
-- applies to any role invoking a definer function without a pinned path).

-- ------------------------------------------------------------
-- STEP 1: expand the role enum. Migrate existing 'admin' rows to
-- 'president' BEFORE adding the new constraint (old 'admin' is not a
-- valid value under the new constraint, and 'president' is not valid
-- under the old one, so the constraint must be dropped first).
-- ------------------------------------------------------------
alter table profiles drop constraint if exists profiles_role_check;

update profiles set role = 'president' where role = 'admin';

alter table profiles add constraint profiles_role_check check (role in (
  'president', 'secretary', 'treasurer', 'board_member', 'administrator', 'advisor', 'viewer'
));

-- ------------------------------------------------------------
-- STEP 2: role-tier helper. Single source of truth for all RLS below —
-- mirrors lib/roles.ts's ROLE_TIER map exactly.
-- ------------------------------------------------------------
create or replace function current_user_role_tier()
returns text as $$
  select case (select role from public.profiles where user_id = auth.uid())
    when 'president' then 'admin_equivalent'
    when 'secretary' then 'admin_equivalent'
    when 'treasurer' then 'board'
    when 'board_member' then 'board'
    when 'administrator' then 'administrator'
    when 'advisor' then 'advisor'
    when 'viewer' then 'viewer'
    else null
  end
$$ language sql security definer stable set search_path = public;

-- ------------------------------------------------------------
-- STEP 3: PROFILES — admin management moves to admin_equivalent tier.
-- Read policy and the not-role self-update policy (from 003) are unchanged.
-- ------------------------------------------------------------
drop policy if exists "Admins can insert profiles" on profiles;
drop policy if exists "Admins can update any profile" on profiles;

create policy "Admin-equivalent can insert profiles"
  on profiles for insert
  with check (current_user_role_tier() = 'admin_equivalent');

create policy "Admin-equivalent can update any profile"
  on profiles for update
  using (current_user_role_tier() = 'admin_equivalent');

-- ------------------------------------------------------------
-- STEP 4: DOCUMENTS — full CRUD for admin_equivalent + administrator;
-- read-only (active) for board tier; nothing for advisor/viewer
-- (advisor gets the same restriction as viewer here, per design).
-- ------------------------------------------------------------
drop policy if exists "Admins manage documents" on documents;
drop policy if exists "Board members read active documents" on documents;

create policy "Admin-equivalent and administrator manage documents"
  on documents for all
  using (current_user_role_tier() in ('admin_equivalent', 'administrator'))
  with check (current_user_role_tier() in ('admin_equivalent', 'administrator'));

create policy "Board reads active documents"
  on documents for select
  using (current_user_role_tier() = 'board' and status = 'active');

-- ------------------------------------------------------------
-- STEP 5: DOCUMENT CHUNKS — same tiering as documents.
-- ------------------------------------------------------------
drop policy if exists "Admins manage chunks" on document_chunks;
drop policy if exists "Board members read active chunks" on document_chunks;

create policy "Admin-equivalent and administrator manage chunks"
  on document_chunks for all
  using (current_user_role_tier() in ('admin_equivalent', 'administrator'))
  with check (current_user_role_tier() in ('admin_equivalent', 'administrator'));

create policy "Board reads active chunks"
  on document_chunks for select
  using (
    current_user_role_tier() = 'board'
    and exists (
      select 1 from documents d
      where d.id = document_chunks.document_id
      and d.status = 'active'
    )
  );

-- ------------------------------------------------------------
-- STEP 6: DOCUMENT FOLDERS — custom folder management follows the
-- same document-management tier.
-- ------------------------------------------------------------
drop policy if exists "Admins can insert custom folders" on document_folders;
drop policy if exists "Admins can delete custom folders" on document_folders;

create policy "Admin-equivalent and administrator insert custom folders"
  on document_folders for insert
  with check (current_user_role_tier() in ('admin_equivalent', 'administrator') and is_system = false);

create policy "Admin-equivalent and administrator delete custom folders"
  on document_folders for delete
  using (current_user_role_tier() in ('admin_equivalent', 'administrator') and is_system = false);

-- ------------------------------------------------------------
-- STEP 7: MEETINGS — full CRUD for admin_equivalent + administrator
-- (administrator excluded from agenda sign-off at the agenda_items table
-- level, not here — meetings themselves are fully manageable). Read-only
-- for board + advisor (advisor needs to see meetings to submit agenda
-- items to them). Viewer gets nothing.
-- ------------------------------------------------------------
drop policy if exists "Admins can manage meetings" on meetings;
drop policy if exists "Board reads meetings" on meetings;

create policy "Admin-equivalent and administrator manage meetings"
  on meetings for all
  using (current_user_role_tier() in ('admin_equivalent', 'administrator'))
  with check (current_user_role_tier() in ('admin_equivalent', 'administrator'));

create policy "Board and advisor read meetings"
  on meetings for select
  using (current_user_role_tier() in ('board', 'advisor'));

-- ------------------------------------------------------------
-- STEP 8: ACTION ITEMS — full CRUD for admin_equivalent, administrator,
-- AND board tier (board_member/treasurer can now create/manage action
-- items directly, not just update their own). Advisor/viewer cannot
-- create/manage items, but CAN be assigned one and must be able to see
-- and update their own assignment (existing owner policies preserved,
-- extended with an owner-read policy so an advisor/viewer assignee can
-- actually see the item they've been assigned — this was previously a
-- gap since the old read policy excluded them entirely).
-- ------------------------------------------------------------
drop policy if exists "Admins can manage action items" on action_items;
drop policy if exists "Board reads action items" on action_items;
-- "Owners can update their action items" (from 001) is unchanged — kept as-is.

create policy "Admin-equivalent, administrator, and board manage action items"
  on action_items for all
  using (current_user_role_tier() in ('admin_equivalent', 'administrator', 'board'))
  with check (current_user_role_tier() in ('admin_equivalent', 'administrator', 'board'));

create policy "Owners can view their action items"
  on action_items for select
  using (owner_user_id = current_profile_id());

-- ------------------------------------------------------------
-- STEP 9: APPROVALS — voting rights unchanged in substance (board tier
-- retains the same voting rights board_member always had); closing/
-- editing the approval_item itself stays admin-equivalent-only, matching
-- today's admin-only /api/approvals/close behavior exactly (renamed, not
-- expanded). Administrator/advisor explicitly excluded from both, per
-- the confirmed design.
-- ------------------------------------------------------------
drop policy if exists "Admins can manage approvals" on approval_items;
drop policy if exists "Board reads approvals" on approval_items;

create policy "Admin-equivalent manages approvals"
  on approval_items for all
  using (current_user_role_tier() = 'admin_equivalent')
  with check (current_user_role_tier() = 'admin_equivalent');

create policy "Board reads approvals"
  on approval_items for select
  using (current_user_role_tier() in ('admin_equivalent', 'board'));

-- approval_votes: voting eligibility unchanged in substance (admin_equivalent + board)
drop policy if exists "Board members can vote" on approval_votes;

create policy "Admin-equivalent and board can vote"
  on approval_votes for insert
  with check (
    current_user_role_tier() in ('admin_equivalent', 'board')
    and voter_user_id = current_profile_id()
  );
-- "Board members can view votes" and "Board members can update own vote" (from 001)
-- contain no role-literal checks beyond current_user_role() = 'admin' inside the
-- view policy's OR clause — update that one reference:
drop policy if exists "Board members can view votes" on approval_votes;

create policy "Board members can view votes"
  on approval_votes for select
  using (
    current_user_role_tier() = 'admin_equivalent'
    or voter_user_id = current_profile_id()
    or exists (
      select 1 from approval_items ai
      where ai.id = approval_item_id
      and ai.show_individual_votes_to_board = true
    )
  );

-- approval_comments: commenting eligibility unchanged in substance
drop policy if exists "Authenticated users can insert comments" on approval_comments;
drop policy if exists "Board reads comments" on approval_comments;

create policy "Admin-equivalent and board can comment"
  on approval_comments for insert
  with check (
    current_user_role_tier() in ('admin_equivalent', 'board')
    and user_id = current_profile_id()
  );

create policy "Board reads comments"
  on approval_comments for select
  using (current_user_role_tier() in ('admin_equivalent', 'board'));

-- ------------------------------------------------------------
-- STEP 10: AI QUERIES — insert eligibility unchanged in substance
-- (previously admin/board_member; administrator/advisor also need AI
-- access per the "canUseAI" gate in lib/roles.ts covering everyone but
-- viewer — extend accordingly).
-- ------------------------------------------------------------
drop policy if exists "Authenticated users can insert queries" on ai_queries;
drop policy if exists "Admins can view all queries" on ai_queries;

create policy "Non-viewers can insert queries"
  on ai_queries for insert
  with check (
    current_user_role_tier() in ('admin_equivalent', 'board', 'administrator', 'advisor')
    and user_id = current_profile_id()
  );

create policy "Admin-equivalent can view all queries"
  on ai_queries for select
  using (current_user_role_tier() = 'admin_equivalent');

-- ------------------------------------------------------------
-- STEP 11: AUDIT LOGS — view access unchanged in substance (admin-only).
-- ------------------------------------------------------------
drop policy if exists "Admins can view audit logs" on audit_logs;

create policy "Admin-equivalent can view audit logs"
  on audit_logs for select
  using (current_user_role_tier() = 'admin_equivalent');

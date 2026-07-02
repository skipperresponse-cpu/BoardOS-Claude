-- ============================================================
-- BoardOS 003 — Board-demo readiness fixes
-- Run this in the Supabase SQL editor AFTER 001 and 002.
-- Single-tenant only. Do NOT onboard a second organisation
-- until multi-tenancy + isolation testing is done.
-- ============================================================

-- ------------------------------------------------------------
-- FIX 1: Documents read policy
-- Problem: original policy
--   using (auth.uid() is not null and status != 'archived' or current_user_role() = 'admin')
-- parses as  (logged-in AND not-archived) OR admin
-- so ANY logged-in user (including viewers) can read every active document.
-- Fix: drop the loose policies and replace with clear, role-based ones.
-- Note: multiple SELECT policies are OR-combined, so we keep them
-- deliberately non-overlapping and restrictive.
-- ------------------------------------------------------------

drop policy if exists "Authenticated users can view active documents" on documents;
drop policy if exists "Board members can view documents" on documents;
drop policy if exists "Admins can manage documents" on documents;

-- Admins: full access (read + write)
create policy "Admins manage documents"
  on documents for all
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

-- Board members: read active (non-archived) documents only
create policy "Board members read active documents"
  on documents for select
  using (
    current_user_role() = 'board_member'
    and status = 'active'
  );

-- Viewers: intentionally NO document read access here.
-- If you want viewers to see a limited set later, add a scoped
-- policy for a specific category or a per-document share flag.
-- Do NOT add a blanket "auth.uid() is not null" policy — that is
-- exactly the hole this migration closes.


-- ------------------------------------------------------------
-- FIX 1b: Document chunks follow the same rule as documents
-- Chunks contain the actual document text used by AI. The original
-- policy let any logged-in user read all chunks. Scope to admins and
-- board members, and only for active parent documents.
-- (Server routes use the service-role key and bypass RLS anyway,
--  but this closes the direct-query hole for the anon key.)
-- ------------------------------------------------------------

drop policy if exists "Authenticated users can view chunks" on document_chunks;
drop policy if exists "Service role can manage chunks" on document_chunks;

create policy "Admins manage chunks"
  on document_chunks for all
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

create policy "Board members read active chunks"
  on document_chunks for select
  using (
    current_user_role() = 'board_member'
    and exists (
      select 1 from documents d
      where d.id = document_chunks.document_id
      and d.status = 'active'
    )
  );


-- ------------------------------------------------------------
-- FIX 1c: Meetings, action items, approvals
-- Original policies let ANY logged-in user read these via
-- "auth.uid() is not null". For a board tool, viewers should not
-- automatically see board meetings/approvals. Tighten reads to
-- admin + board_member. (Adjust if you deliberately want viewers in.)
-- ------------------------------------------------------------

drop policy if exists "Authenticated users can view meetings" on meetings;
create policy "Board reads meetings"
  on meetings for select
  using (current_user_role() in ('admin','board_member'));

drop policy if exists "Authenticated users can view action items" on action_items;
create policy "Board reads action items"
  on action_items for select
  using (current_user_role() in ('admin','board_member'));

drop policy if exists "Authenticated users can view approvals" on approval_items;
create policy "Board reads approvals"
  on approval_items for select
  using (current_user_role() in ('admin','board_member'));

drop policy if exists "Authenticated users can view comments" on approval_comments;
create policy "Board reads comments"
  on approval_comments for select
  using (current_user_role() in ('admin','board_member'));


-- ------------------------------------------------------------
-- FIX 2: Stop users self-assigning admin at signup
-- Problem: handle_new_user() reads role from raw_user_meta_data,
-- which is user-supplied. A user could sign up as 'admin'.
-- Fix: force every new profile to 'viewer'. Promote real board
-- members / admins yourself (see the manual step at the bottom).
-- ------------------------------------------------------------

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (user_id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'viewer'   -- always lowest privilege; never trust client metadata
  );
  return new;
end;
$$ language plpgsql security definer;

-- Also stop non-admins from escalating their own role after signup.
-- The existing "Users can update own profile" policy allows a user to
-- update their profile row, which includes the role column. Replace it
-- so users can update their own profile but NOT change their role.
drop policy if exists "Users can update own profile" on profiles;
create policy "Users update own profile (not role)"
  on profiles for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and role = (select role from profiles where user_id = auth.uid())
  );


-- ============================================================
-- MANUAL STEP — promote yourself and your real board members.
-- Run these by hand after the people have signed up once.
-- Replace the emails with the real ones.
-- ============================================================
-- update profiles set role = 'admin'        where email = 'daniel@example.org';
-- update profiles set role = 'board_member' where email = 'chair@example.org';
-- update profiles set role = 'board_member' where email = 'treasurer@example.org';

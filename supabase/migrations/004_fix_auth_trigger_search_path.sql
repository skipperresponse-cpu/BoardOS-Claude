-- ============================================================
-- BoardOS 004 — Fix broken new-user creation (search_path bug)
-- Run this in the Supabase SQL editor AFTER 001, 002, and 003.
-- ============================================================
--
-- SYMPTOM: auth.admin.createUser() / invite / signup all fail with
--   {"message":"Database error creating new user","code":"unexpected_failure"}
-- The underlying Postgres error (visible in Dashboard > Logs > Postgres) is:
--   42P01  relation "profiles" does not exist
--
-- ROOT CAUSE: handle_new_user() is SECURITY DEFINER but has no explicit
-- search_path. Functions without one resolve unqualified table names using
-- the CALLING role's search_path at runtime — and the role that fires the
-- on_auth_user_created trigger (supabase_auth_admin) does not have `public`
-- on its search_path. So `profiles` (unqualified) fails to resolve, even
-- though the table exists and is reachable fine from PostgREST/RLS context.
--
-- FIX: schema-qualify every table reference and pin search_path explicitly
-- on every SECURITY DEFINER function. This is Supabase's own documented
-- best practice for SECURITY DEFINER functions, independent of what
-- triggered the search_path to be missing in the first place.
-- ============================================================

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'viewer'   -- always lowest privilege; never trust client metadata
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function current_profile_id()
returns uuid as $$
  select id from public.profiles where user_id = auth.uid()
$$ language sql security definer stable set search_path = public;

create or replace function current_user_role()
returns text as $$
  select role from public.profiles where user_id = auth.uid()
$$ language sql security definer stable set search_path = public;

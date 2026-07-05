-- ============================================================
-- BoardOS 013 — Document visibility groups
-- Single-tenant only.
-- ============================================================
--
-- Standing, managed groups only — never arbitrary per-document access lists —
-- so "who is in group X" always answers with a single query. Three membership
-- shapes, mutually exclusive per row:
--   'role_based'   — allowed_roles text[] (Everyone/Board Only/President &
--                    Secretary Only map directly onto existing role tiers,
--                    so membership tracks role changes automatically —
--                    no manual sync, same reasoning the brief gives for
--                    preferring subcommittee-linked groups over static lists)
--   'subcommittee' — membership IS that subcommittee's internal members
--                    (subcommittee_members.user_id is not null), live —
--                    updates automatically as the roster changes
--   'static'       — an explicit list of users, via visibility_group_members,
--                    for groups that don't map to a role tier or subcommittee
--
-- Applies ONLY to the Documents module (Task 3) — meetings/agenda_items/
-- action_items RLS is untouched by this migration.

create table if not exists visibility_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  membership_type text not null check (membership_type in ('role_based', 'subcommittee', 'static')),
  allowed_roles text[],
  subcommittee_id uuid references subcommittees(id) on delete set null,
  is_system boolean not null default false, -- protects the seeded role-based groups from deletion, mirrors document_folders.is_system
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint visibility_groups_membership_shape check (
    (membership_type = 'role_based' and allowed_roles is not null and subcommittee_id is null)
    or (membership_type = 'subcommittee' and subcommittee_id is not null and allowed_roles is null)
    or (membership_type = 'static' and allowed_roles is null and subcommittee_id is null)
  )
);

create trigger visibility_groups_updated_at before update on visibility_groups
  for each row execute function update_updated_at();

create table if not exists visibility_group_members (
  id uuid primary key default gen_random_uuid(),
  visibility_group_id uuid references visibility_groups(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (visibility_group_id, user_id)
);

create index if not exists visibility_group_members_group_id_idx on visibility_group_members(visibility_group_id);

-- ------------------------------------------------------------
-- Seed the three role-based groups. Finance & Remuneration (subcommittee-
-- linked) is deliberately NOT seeded here — no such subcommittee exists yet
-- (per the brief: "Add Finance & Remuneration only once that subcommittee
-- exists in the system").
-- ------------------------------------------------------------
insert into visibility_groups (name, membership_type, allowed_roles, is_system) values
  ('Everyone', 'role_based', array['president','secretary','treasurer','board_member','administrator','advisor'], true),
  ('Board Only', 'role_based', array['president','secretary','treasurer','board_member'], true),
  ('President & Secretary Only', 'role_based', array['president','secretary'], true)
on conflict (name) do nothing;

-- ------------------------------------------------------------
-- Folder default visibility + per-document override + optional resolution
-- link (Task 4 plumbing only — no upload UI; a resolution's own detail page/
-- content/vote data is untouched by this feature entirely, per Task 3's
-- boundary. The minutes acknowledgement entry already reads only resolution
-- fields directly, never joining documents, so it stays visible regardless
-- of any linked document's visibility group with zero code changes needed —
-- see the comment on AcknowledgementBlock in meeting-detail-client.tsx).
-- ------------------------------------------------------------
alter table document_folders
  add column if not exists default_visibility_group_id uuid references visibility_groups(id) on delete set null;

alter table documents
  add column if not exists visibility_group_id uuid references visibility_groups(id) on delete set null,
  add column if not exists resolution_id uuid references resolutions(id) on delete set null;

create index if not exists documents_visibility_group_id_idx on documents(visibility_group_id);
create index if not exists documents_resolution_id_idx on documents(resolution_id);

-- Sensible starting defaults per folder — editable later if Daniel wants
-- different ones; per Task 2's own examples (Constitution and By-laws /
-- General -> Everyone, Financial Reports -> a restricted group).
update document_folders set default_visibility_group_id = (select id from visibility_groups where name = 'Everyone')
  where name in ('Constitution and By-laws', 'General', 'Policies', 'Presentations');
update document_folders set default_visibility_group_id = (select id from visibility_groups where name = 'Board Only')
  where name in ('Financial Reports', 'Minutes', 'Correspondence', 'Legal', 'Pre-reads');
-- Any other folder (including custom, non-system ones like "Position Papers")
-- defaults to Everyone — the least-restrictive safe default.
update document_folders set default_visibility_group_id = (select id from visibility_groups where name = 'Everyone')
  where default_visibility_group_id is null;

alter table document_folders alter column default_visibility_group_id set not null;

-- Backfill existing documents from their folder's default, matching the
-- documents.folder_id NOT NULL precedent (migration 009) exactly.
update documents d set visibility_group_id = f.default_visibility_group_id
  from document_folders f where d.folder_id = f.id and d.visibility_group_id is null;

alter table documents alter column visibility_group_id set not null;

-- ------------------------------------------------------------
-- Membership-resolution function, usable inside RLS policies. SECURITY
-- DEFINER + search_path = public is mandatory (see migration 004's incident).
-- ------------------------------------------------------------
create or replace function can_view_visibility_group(p_group_id uuid)
returns boolean as $$
declare
  grp visibility_groups%rowtype;
  my_role text;
  my_profile_id uuid;
begin
  select * into grp from visibility_groups where id = p_group_id;
  if not found then
    return false;
  end if;

  select role, id into my_role, my_profile_id from profiles where user_id = auth.uid();
  if my_role is null then
    return false;
  end if;

  if grp.membership_type = 'role_based' then
    return my_role = any(grp.allowed_roles);
  elsif grp.membership_type = 'subcommittee' then
    return exists (
      select 1 from subcommittee_members
      where subcommittee_id = grp.subcommittee_id and user_id = my_profile_id
    );
  elsif grp.membership_type = 'static' then
    return exists (
      select 1 from visibility_group_members
      where visibility_group_id = grp.id and user_id = my_profile_id
    );
  end if;

  return false;
end;
$$ language plpgsql security definer set search_path = public;

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table visibility_groups enable row level security;
alter table visibility_group_members enable row level security;

create policy "Board-tier and above read visibility groups"
  on visibility_groups for select
  using (current_user_role_tier() in ('admin_equivalent', 'board', 'administrator', 'advisor'));

create policy "Admin-equivalent manage visibility groups"
  on visibility_groups for all
  using (current_user_role_tier() = 'admin_equivalent')
  with check (current_user_role_tier() = 'admin_equivalent');

create policy "Board-tier and above read visibility group members"
  on visibility_group_members for select
  using (current_user_role_tier() in ('admin_equivalent', 'board', 'administrator', 'advisor'));

create policy "Admin-equivalent manage visibility group members"
  on visibility_group_members for all
  using (current_user_role_tier() = 'admin_equivalent')
  with check (current_user_role_tier() = 'admin_equivalent');

-- ------------------------------------------------------------
-- DOCUMENTS: replace the flat "board tier, active only" read policy with a
-- visibility-group-aware one that also covers advisor (previously zero doc
-- access at all) — advisor is included in the "Everyone" group's allowed_roles
-- by the brief's own definition, so this is a deliberate, brief-specified
-- widening, not an oversight. admin_equivalent/administrator keep full access
-- unchanged via the existing "manage documents" for-all policy.
-- ------------------------------------------------------------
drop policy if exists "Board reads active documents" on documents;

create policy "Visibility-group scoped document reads"
  on documents for select
  using (
    current_user_role_tier() in ('board', 'advisor')
    and status = 'active'
    and (visibility_group_id is null or can_view_visibility_group(visibility_group_id))
  );

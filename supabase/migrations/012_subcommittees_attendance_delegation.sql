-- ============================================================
-- BoardOS 012 — Subcommittees, delegated meeting rights, attendance & guests
-- Single-tenant only.
-- ============================================================
--
-- All writes to the new tables go through dedicated service-role API routes
-- with their own app-layer permission checks (matching the pattern already
-- used for resolutions, pre-read attachments, and document recategorisation
-- this session), NOT direct client-side inserts. RLS below is a broad
-- defense-in-depth backstop (admin_equivalent + administrator), not the
-- primary enforcement mechanism — the fine-grained "is this user the
-- standing chair or an active ad hoc delegate for THIS meeting" logic lives
-- in lib/meetings/permissions.ts (canManageThisMeeting), which needs to join
-- across subcommittees/meeting_delegations and so can't be expressed cleanly
-- as a single-table RLS policy.

-- ------------------------------------------------------------
-- SUBCOMMITTEES — standing org structure, membership persists for a term,
-- independent of any specific meeting.
-- ------------------------------------------------------------
create table if not exists subcommittees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  term_start date,
  term_end date, -- informational only; term ending does NOT auto-revoke the
                  -- chair's standing meeting-management right (confirmed with
                  -- Daniel) — revocation is the explicit act of president/
                  -- secretary changing/clearing chair_user_id.
  chair_user_id uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger subcommittees_updated_at before update on subcommittees
  for each row execute function update_updated_at();

-- ------------------------------------------------------------
-- SUBCOMMITTEE MEMBERS — standing roster entries, not per-meeting attendees.
-- Either an internal system user OR an external record (name/affiliation/
-- email) for people with no system access — never both, never neither.
-- ------------------------------------------------------------
create table if not exists subcommittee_members (
  id uuid primary key default gen_random_uuid(),
  subcommittee_id uuid references subcommittees(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade,
  external_name text,
  external_affiliation text,
  external_email text,
  created_at timestamptz default now(),
  constraint subcommittee_members_internal_xor_external check (
    (user_id is not null and external_name is null and external_affiliation is null and external_email is null)
    or
    (user_id is null and external_name is not null)
  ),
  constraint subcommittee_members_unique_user unique (subcommittee_id, user_id)
);

create index if not exists subcommittee_members_subcommittee_id_idx on subcommittee_members(subcommittee_id);

-- ------------------------------------------------------------
-- MEETINGS — optional subcommittee scope. Nullable: most meetings (full
-- board meetings) have no subcommittee; a meeting scoped to a subcommittee
-- gets automatic attendee pre-population and chair rights (Task 2).
-- ------------------------------------------------------------
alter table meetings
  add column if not exists subcommittee_id uuid references subcommittees(id) on delete set null;

create index if not exists meetings_subcommittee_id_idx on meetings(subcommittee_id);

-- ------------------------------------------------------------
-- MEETING DELEGATIONS — ad hoc, expiring, scoped to ONE meeting. President/
-- Secretary only can grant. Auto-expires 2 weeks after granted_at; expiry is
-- purely date-driven (checked live via expires_at in canManageThisMeeting),
-- no separate revocation flow for these per the brief's scope.
-- ------------------------------------------------------------
create table if not exists meeting_delegations (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade not null,
  delegated_to_user_id uuid references profiles(id) on delete cascade not null,
  granted_by_user_id uuid references profiles(id) on delete set null,
  granted_at timestamptz default now(),
  expires_at timestamptz not null,
  reminder_sent_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists meeting_delegations_meeting_id_idx on meeting_delegations(meeting_id);
create index if not exists meeting_delegations_active_idx on meeting_delegations(delegated_to_user_id, expires_at);

-- ------------------------------------------------------------
-- MEETING ATTENDEES — internal (system-user) attendees. Compulsory at
-- meeting creation. `invited` vs `attended` tracked separately — attended is
-- null until confirmed (post-Held confirmation step), not a proxy for invited.
-- ------------------------------------------------------------
create table if not exists meeting_attendees (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  invited boolean not null default true,
  attended boolean,
  created_at timestamptz default now(),
  constraint meeting_attendees_unique unique (meeting_id, user_id)
);

create index if not exists meeting_attendees_meeting_id_idx on meeting_attendees(meeting_id);

-- ------------------------------------------------------------
-- MEETING GUESTS — one-off, meeting-specific, no system access, no standing
-- roster (distinct from external subcommittee members, which persist across
-- meetings). No pre-read/notification delivery to guests — records only.
-- ------------------------------------------------------------
create table if not exists meeting_guests (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade not null,
  name text not null,
  affiliation text,
  email text,
  attended boolean,
  created_at timestamptz default now()
);

create index if not exists meeting_guests_meeting_id_idx on meeting_guests(meeting_id);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table subcommittees enable row level security;
alter table subcommittee_members enable row level security;
alter table meeting_delegations enable row level security;
alter table meeting_attendees enable row level security;
alter table meeting_guests enable row level security;

-- SUBCOMMITTEES / MEMBERS: read matches meeting visibility (everyone except
-- viewer); write (structure/roster/chair) is president/secretary only.
create policy "Board-tier and above read subcommittees"
  on subcommittees for select
  using (current_user_role_tier() in ('admin_equivalent', 'board', 'administrator', 'advisor'));

create policy "Admin-equivalent manage subcommittees"
  on subcommittees for all
  using (current_user_role_tier() = 'admin_equivalent')
  with check (current_user_role_tier() = 'admin_equivalent');

create policy "Board-tier and above read subcommittee members"
  on subcommittee_members for select
  using (current_user_role_tier() in ('admin_equivalent', 'board', 'administrator', 'advisor'));

create policy "Admin-equivalent manage subcommittee members"
  on subcommittee_members for all
  using (current_user_role_tier() = 'admin_equivalent')
  with check (current_user_role_tier() = 'admin_equivalent');

-- MEETING DELEGATIONS: admin-equivalent sees/manages all; a delegate can see
-- their own grant (so the UI can show them their temporary rights + expiry).
create policy "Admin-equivalent read all delegations"
  on meeting_delegations for select
  using (
    current_user_role_tier() = 'admin_equivalent'
    or delegated_to_user_id = current_profile_id()
  );

create policy "Admin-equivalent manage delegations"
  on meeting_delegations for all
  using (current_user_role_tier() = 'admin_equivalent')
  with check (current_user_role_tier() = 'admin_equivalent');

-- MEETING ATTENDEES / GUESTS: read matches meeting visibility; direct-client
-- write restricted to the broad manage tier as a backstop (actual chair/
-- delegate writes go through service-role routes, see note above).
create policy "Board-tier and above read meeting attendees"
  on meeting_attendees for select
  using (current_user_role_tier() in ('admin_equivalent', 'board', 'administrator', 'advisor'));

create policy "Admin-equivalent and administrator manage meeting attendees"
  on meeting_attendees for all
  using (current_user_role_tier() in ('admin_equivalent', 'administrator'))
  with check (current_user_role_tier() in ('admin_equivalent', 'administrator'));

create policy "Board-tier and above read meeting guests"
  on meeting_guests for select
  using (current_user_role_tier() in ('admin_equivalent', 'board', 'administrator', 'advisor'));

create policy "Admin-equivalent and administrator manage meeting guests"
  on meeting_guests for all
  using (current_user_role_tier() in ('admin_equivalent', 'administrator'))
  with check (current_user_role_tier() in ('admin_equivalent', 'administrator'));

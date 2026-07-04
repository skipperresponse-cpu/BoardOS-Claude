-- ============================================================
-- BoardOS 007 — Resolutions module + agenda_items infrastructure
-- Run this in the Supabase SQL editor AFTER 001-006.
-- Single-tenant only.
-- ============================================================
--
-- Completes the agenda_items table that a prior session planned but never
-- implemented (verified via git log + live schema check — nothing existed).
-- Redesigned with a `type` column and a single nullable `current_meeting_id`
-- so discussion items and resolution acknowledgements share one queue/
-- roll-forward mechanism (current_meeting_id IS NULL = sitting in the
-- Outstanding Agenda depository).
--
-- Resolutions reuse approval_items/approval_votes as the voting engine
-- (already meeting-independent — linked_meeting_id is nullable) rather than
-- building a parallel voting system. New pass/fail auto-detection logic is
-- added via a trigger since vote casting is a direct client-side insert
-- today with no server route to hook into.

-- ------------------------------------------------------------
-- RESOLUTIONS
-- ------------------------------------------------------------
create table if not exists resolutions (
  id uuid primary key default gen_random_uuid(),
  approval_item_id uuid references approval_items(id) on delete restrict not null,
  title text not null,
  content text not null,
  pass_mode text not null check (pass_mode in ('unanimous', 'threshold')),
  required_threshold numeric, -- always a percentage; null when unanimous
  threshold_reference text,
  eligible_voter_count integer, -- snapshot taken at circulation time
  status text not null default 'draft' check (status in ('draft', 'circulated', 'passed', 'failed', 'noted')),
  created_by uuid references profiles(id) on delete set null not null,
  circulated_at timestamptz,
  passed_at timestamptz,
  vote_result text,
  queued_for_meeting_id uuid references meetings(id) on delete set null,
  ratified_at_meeting_id uuid references meetings(id) on delete set null,
  document_link text,
  resolution_requested_by uuid references profiles(id) on delete set null,
  resolution_requested_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger resolutions_updated_at before update on resolutions
  for each row execute function update_updated_at();

-- ------------------------------------------------------------
-- AGENDA ITEMS
-- ------------------------------------------------------------
create table if not exists agenda_items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('discussion', 'approval_request', 'acknowledgement')),
  current_meeting_id uuid references meetings(id) on delete set null,
  submitted_by uuid references profiles(id) on delete set null, -- null for system-created acknowledgement items
  title text not null,
  description text,
  status text not null default 'submitted' check (status in
    ('submitted', 'approved', 'edited_approved', 'deferred', 'rejected', 'pending', 'noted')),
    -- discussion/approval_request use: submitted/approved/edited_approved/deferred/rejected
    -- acknowledgement uses: pending/noted (no vote — enforced in app code, not a per-type DB constraint)
  resolution_id uuid references resolutions(id) on delete restrict,
  display_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists agenda_items_current_meeting_id_idx on agenda_items(current_meeting_id);
create index if not exists agenda_items_unassigned_idx on agenda_items(type) where current_meeting_id is null;

create trigger agenda_items_updated_at before update on agenda_items
  for each row execute function update_updated_at();

-- ------------------------------------------------------------
-- AGENDA ITEM QUEUE HISTORY — audit trail for current_meeting_id changes
-- ------------------------------------------------------------
create table if not exists agenda_item_queue_history (
  id uuid primary key default gen_random_uuid(),
  agenda_item_id uuid references agenda_items(id) on delete cascade not null,
  from_meeting_id uuid references meetings(id) on delete set null,
  to_meeting_id uuid references meetings(id) on delete set null,
  changed_at timestamptz default now(),
  reason text not null -- 'initial_submission' | 'deferred' | 'rolled_forward' | 'manually_assigned'
);

create index if not exists agenda_item_queue_history_item_idx on agenda_item_queue_history(agenda_item_id);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table resolutions enable row level security;
alter table agenda_items enable row level security;
alter table agenda_item_queue_history enable row level security;

-- RESOLUTIONS: read access matches approval_items' read policy exactly
-- (admin_equivalent + board tier). No user-facing insert/update policy —
-- creation goes through app/api/resolutions/route.tsx (service role,
-- canFlagForResolution-gated in app code); the pass-detection trigger runs
-- as SECURITY DEFINER and bypasses RLS for its own updates.
create policy "Admin-equivalent and board read resolutions"
  on resolutions for select
  using (current_user_role_tier() in ('admin_equivalent', 'board'));

-- AGENDA ITEMS
create policy "Board-tier and above read agenda items"
  on agenda_items for select
  using (current_user_role_tier() in ('admin_equivalent', 'board', 'administrator', 'advisor'));

-- Only discussion/approval_request items can be user-submitted; acknowledgement
-- rows are only ever created by the pass-detection trigger (SECURITY DEFINER).
create policy "Submit discussion or approval-request agenda items"
  on agenda_items for insert
  with check (
    current_user_role_tier() in ('admin_equivalent', 'board', 'administrator', 'advisor')
    and submitted_by = current_profile_id()
    and type in ('discussion', 'approval_request')
  );

create policy "Admin-equivalent edit agenda items until held"
  on agenda_items for update
  using (
    current_user_role_tier() = 'admin_equivalent'
    and exists (
      select 1 from meetings m
      where m.id = current_meeting_id
      and m.status in ('agenda_locked', 'scheduled')
    )
  )
  with check (
    current_user_role_tier() = 'admin_equivalent'
    and exists (
      select 1 from meetings m
      where m.id = current_meeting_id
      and m.status in ('agenda_locked', 'scheduled')
    )
  );

-- AGENDA ITEM QUEUE HISTORY: read-only, admin-equivalent (Outstanding Agenda
-- depository is president/secretary-only). Written by trigger + service-role
-- app code only.
create policy "Admin-equivalent reads queue history"
  on agenda_item_queue_history for select
  using (current_user_role_tier() = 'admin_equivalent');

-- ------------------------------------------------------------
-- PASS/FAIL DETECTION TRIGGER
-- ------------------------------------------------------------
-- Fires on every vote insert/update. Only acts on approval_items linked to
-- a resolution still in 'circulated' status (idempotent — once passed/failed,
-- further vote changes don't re-trigger, matching "passed_at is the binding
-- moment" and no un-doing after the fact). Pure SQL — no AI, no email — the
-- existing generateResolution() AI helper stays available as a manually
-- triggered wording-polish action, not a dependency of this state machine.
create or replace function check_resolution_pass()
returns trigger as $$
declare
  res resolutions%rowtype;
  approve_count integer;
  disapprove_count integer;
  new_status text;
  computed_vote_result text;
  next_meeting_id uuid;
  new_agenda_item_id uuid;
begin
  select * into res from resolutions where approval_item_id = NEW.approval_item_id;
  if not found then
    return NEW; -- not a resolution-linked approval; regular meeting approvals unaffected
  end if;

  if res.status != 'circulated' then
    return NEW; -- already resolved (or not yet circulated) — don't recompute
  end if;

  select
    count(*) filter (where vote = 'Approve'),
    count(*) filter (where vote = 'Disapprove')
  into approve_count, disapprove_count
  from approval_votes
  where approval_item_id = NEW.approval_item_id;

  new_status := null;

  if res.pass_mode = 'unanimous' then
    if disapprove_count > 0 then
      new_status := 'failed';
    elsif res.eligible_voter_count is not null and approve_count >= res.eligible_voter_count then
      new_status := 'passed';
    end if;
  elsif res.pass_mode = 'threshold' then
    if res.eligible_voter_count is not null and res.eligible_voter_count > 0
       and (approve_count::numeric / res.eligible_voter_count::numeric) * 100 >= coalesce(res.required_threshold, 100)
    then
      new_status := 'passed';
    end if;
  end if;

  if new_status is null then
    return NEW; -- still pending, not enough votes yet
  end if;

  if new_status = 'passed' then
    computed_vote_result := approve_count || ' of ' || res.eligible_voter_count || ' approved (' ||
      round((approve_count::numeric / nullif(res.eligible_voter_count, 0)::numeric) * 100) || '%)';
  else
    computed_vote_result := approve_count || ' of ' || res.eligible_voter_count || ' approved — did not pass';
  end if;

  update resolutions
    set status = new_status,
        passed_at = case when new_status = 'passed' then now() else passed_at end,
        vote_result = computed_vote_result
    where id = res.id;

  update approval_items
    set status = case when new_status = 'passed' then 'approved' else 'rejected' end,
        closed_at = now()
    where id = res.approval_item_id;

  -- Only passed resolutions need meeting acknowledgement — a failed
  -- resolution is a record, not a decision requiring a meeting to note it.
  if new_status = 'passed' then
    select id into next_meeting_id
      from meetings
      where status in ('draft', 'agenda_open')
      order by meeting_date asc
      limit 1;

    insert into agenda_items (type, current_meeting_id, submitted_by, title, description, status, resolution_id)
      values (
        'acknowledgement', next_meeting_id, null, res.title,
        'Acknowledgement of passed resolution: ' || res.title, 'pending', res.id
      )
      returning id into new_agenda_item_id;

    update resolutions set queued_for_meeting_id = next_meeting_id where id = res.id;

    insert into agenda_item_queue_history (agenda_item_id, from_meeting_id, to_meeting_id, reason)
      values (new_agenda_item_id, null, next_meeting_id, 'initial_submission');
  end if;

  return NEW;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists approval_votes_check_resolution_pass on approval_votes;
create trigger approval_votes_check_resolution_pass
  after insert or update on approval_votes
  for each row execute function check_resolution_pass();

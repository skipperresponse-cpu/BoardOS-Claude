-- BoardOS V1 Database Schema
-- Run this in your Supabase SQL editor

-- Enable pgvector for embeddings
create extension if not exists vector;

-- ============================================================
-- PROFILES
-- ============================================================
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  full_name text not null,
  email text not null,
  role text not null default 'viewer' check (role in ('admin', 'board_member', 'viewer')),
  created_at timestamptz default now()
);

-- ============================================================
-- DOCUMENTS
-- ============================================================
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in (
    'Constitution','By-laws','SOP','Policy','Board Minutes','Board Paper',
    'AGM','Finance','HR','Regulatory','Grant','Correspondence','Other'
  )),
  description text,
  file_path text not null,
  extracted_text text,
  uploaded_by uuid references profiles(id) on delete set null,
  document_date date,
  status text not null default 'active' check (status in ('active','archived','draft')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- DOCUMENT CHUNKS
-- ============================================================
create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade not null,
  chunk_text text not null,
  chunk_index integer not null,
  embedding vector(512),
  created_at timestamptz default now()
);

create index if not exists document_chunks_document_id_idx on document_chunks(document_id);

-- ============================================================
-- MEETINGS
-- ============================================================
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  meeting_date timestamptz not null,
  attendees_json jsonb default '[]',
  absentees_json jsonb default '[]',
  agenda_json jsonb default '[]',
  transcript_text text,
  draft_minutes text,
  final_minutes text,
  status text not null default 'scheduled' check (status in ('scheduled','draft_minutes','approved','cancelled')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- ACTION ITEMS
-- ============================================================
create table if not exists action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete set null,
  title text not null,
  description text,
  owner_user_id uuid references profiles(id) on delete set null,
  due_date date,
  status text not null default 'Not Started' check (status in ('Not Started','In Progress','Done','Blocked')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- APPROVAL ITEMS
-- ============================================================
create table if not exists approval_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  proposal_text text not null,
  linked_documents_json jsonb default '[]',
  linked_meeting_id uuid references meetings(id) on delete set null,
  voting_deadline timestamptz,
  approval_type text not null default 'simple_majority' check (
    approval_type in ('simple_majority','two_thirds','unanimous','custom')
  ),
  custom_threshold numeric,
  show_individual_votes_to_board boolean default false,
  status text not null default 'open' check (
    status in ('open','paused','closed','approved','rejected','archived')
  ),
  resolution_text text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  closed_at timestamptz
);

-- ============================================================
-- APPROVAL VOTES
-- ============================================================
create table if not exists approval_votes (
  id uuid primary key default gen_random_uuid(),
  approval_item_id uuid references approval_items(id) on delete cascade not null,
  voter_user_id uuid references profiles(id) on delete cascade not null,
  vote text not null check (vote in ('Approve','Disapprove','Abstain','Request Clarification')),
  reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(approval_item_id, voter_user_id)
);

-- ============================================================
-- APPROVAL COMMENTS
-- ============================================================
create table if not exists approval_comments (
  id uuid primary key default gen_random_uuid(),
  approval_item_id uuid references approval_items(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  comment_text text not null,
  parent_comment_id uuid references approval_comments(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- AI QUERIES
-- ============================================================
create table if not exists ai_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  question text not null,
  answer text not null,
  confidence text not null check (confidence in ('high','medium','low','insufficient')),
  sources_used jsonb default '[]',
  created_at timestamptz default now()
);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger documents_updated_at before update on documents
  for each row execute function update_updated_at();

create trigger meetings_updated_at before update on meetings
  for each row execute function update_updated_at();

create trigger action_items_updated_at before update on action_items
  for each row execute function update_updated_at();

create trigger approval_items_updated_at before update on approval_items
  for each row execute function update_updated_at();

create trigger approval_votes_updated_at before update on approval_votes
  for each row execute function update_updated_at();

create trigger approval_comments_updated_at before update on approval_comments
  for each row execute function update_updated_at();

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (user_id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'viewer')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table documents enable row level security;
alter table document_chunks enable row level security;
alter table meetings enable row level security;
alter table action_items enable row level security;
alter table approval_items enable row level security;
alter table approval_votes enable row level security;
alter table approval_comments enable row level security;
alter table ai_queries enable row level security;
alter table audit_logs enable row level security;

-- Helper: get current user's profile id
create or replace function current_profile_id()
returns uuid as $$
  select id from profiles where user_id = auth.uid()
$$ language sql security definer stable;

-- Helper: get current user's role
create or replace function current_user_role()
returns text as $$
  select role from profiles where user_id = auth.uid()
$$ language sql security definer stable;

-- PROFILES RLS
create policy "Users can view all profiles" on profiles
  for select using (auth.uid() is not null);

create policy "Users can update own profile" on profiles
  for update using (user_id = auth.uid());

create policy "Admins can insert profiles" on profiles
  for insert with check (current_user_role() = 'admin');

create policy "Admins can update any profile" on profiles
  for update using (current_user_role() = 'admin');

-- DOCUMENTS RLS
create policy "Authenticated users can view active documents" on documents
  for select using (auth.uid() is not null and status != 'archived' or current_user_role() = 'admin');

create policy "Admins can manage documents" on documents
  for all using (current_user_role() = 'admin');

create policy "Board members can view documents" on documents
  for select using (current_user_role() in ('admin','board_member'));

-- DOCUMENT CHUNKS RLS
create policy "Authenticated users can view chunks" on document_chunks
  for select using (auth.uid() is not null);

create policy "Service role can manage chunks" on document_chunks
  for all using (current_user_role() = 'admin');

-- MEETINGS RLS
create policy "Authenticated users can view meetings" on meetings
  for select using (auth.uid() is not null);

create policy "Admins can manage meetings" on meetings
  for all using (current_user_role() = 'admin');

-- ACTION ITEMS RLS
create policy "Authenticated users can view action items" on action_items
  for select using (auth.uid() is not null);

create policy "Admins can manage action items" on action_items
  for all using (current_user_role() = 'admin');

create policy "Owners can update their action items" on action_items
  for update using (owner_user_id = current_profile_id());

-- APPROVAL ITEMS RLS
create policy "Authenticated users can view approvals" on approval_items
  for select using (auth.uid() is not null);

create policy "Admins can manage approvals" on approval_items
  for all using (current_user_role() = 'admin');

-- APPROVAL VOTES RLS
create policy "Board members can view votes" on approval_votes
  for select using (
    current_user_role() = 'admin'
    or voter_user_id = current_profile_id()
    or exists (
      select 1 from approval_items ai
      where ai.id = approval_item_id
      and ai.show_individual_votes_to_board = true
    )
  );

create policy "Board members can vote" on approval_votes
  for insert with check (
    current_user_role() in ('admin','board_member')
    and voter_user_id = current_profile_id()
  );

create policy "Board members can update own vote" on approval_votes
  for update using (
    voter_user_id = current_profile_id()
    and exists (
      select 1 from approval_items ai
      where ai.id = approval_item_id and ai.status = 'open'
    )
  );

-- APPROVAL COMMENTS RLS
create policy "Authenticated users can view comments" on approval_comments
  for select using (auth.uid() is not null);

create policy "Authenticated users can insert comments" on approval_comments
  for insert with check (
    current_user_role() in ('admin','board_member')
    and user_id = current_profile_id()
  );

create policy "Users can update own comments" on approval_comments
  for update using (user_id = current_profile_id());

-- AI QUERIES RLS
create policy "Users can view own queries" on ai_queries
  for select using (user_id = current_profile_id());

create policy "Admins can view all queries" on ai_queries
  for select using (current_user_role() = 'admin');

create policy "Authenticated users can insert queries" on ai_queries
  for insert with check (
    current_user_role() in ('admin','board_member')
    and user_id = current_profile_id()
  );

-- AUDIT LOGS RLS
create policy "Admins can view audit logs" on audit_logs
  for select using (current_user_role() = 'admin');

create policy "Service role can insert audit logs" on audit_logs
  for insert with check (true);

-- ============================================================
-- STORAGE BUCKET (run separately in Supabase dashboard or CLI)
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('governance-docs', 'governance-docs', false);
-- Storage RLS policies are set separately in the Supabase dashboard.

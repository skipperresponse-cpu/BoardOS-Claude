-- BoardOS V2: Document Folders
-- Run this in your Supabase SQL editor after 001_initial.sql

-- ============================================================
-- DOCUMENT FOLDERS
-- ============================================================
create table if not exists document_folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  is_system  boolean not null default false,
  created_at timestamptz default now(),
  created_by uuid references profiles(id) on delete set null,
  constraint document_folders_name_unique unique (name)
);

-- Add folder_id to documents (nullable — old docs keep null until reassigned)
alter table documents
  add column if not exists folder_id uuid references document_folders(id) on delete set null;

create index if not exists documents_folder_id_idx on documents(folder_id);

-- ============================================================
-- SEED SYSTEM FOLDERS
-- ============================================================
insert into document_folders (name, is_system) values
  ('Minutes',           true),
  ('Financial Reports', true),
  ('Policies',          true),
  ('Correspondence',    true),
  ('Legal',             true),
  ('Presentations',     true),
  ('General',           true)
on conflict (name) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table document_folders enable row level security;

create policy "Authenticated users can view folders" on document_folders
  for select using (auth.uid() is not null);

create policy "Admins can insert custom folders" on document_folders
  for insert with check (current_user_role() = 'admin' and is_system = false);

create policy "Admins can delete custom folders" on document_folders
  for delete using (current_user_role() = 'admin' and is_system = false);

-- Every document must belong to a folder — no more implicit "uncategorized" state.

-- Backfill any legacy documents with no folder into the General system folder.
update documents
set folder_id = (select id from document_folders where name = 'General' limit 1)
where folder_id is null;

alter table documents
  alter column folder_id set not null;

-- Previously deleting a folder just orphaned its documents (ON DELETE SET NULL),
-- which is no longer possible now that folder_id can't be null. The app already
-- blocks deleting a non-empty folder in the UI; this makes it a hard DB guarantee.
alter table documents
  drop constraint if exists documents_folder_id_fkey;

alter table documents
  add constraint documents_folder_id_fkey
  foreign key (folder_id) references document_folders(id) on delete restrict;

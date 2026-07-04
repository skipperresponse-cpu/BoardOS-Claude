-- Pre-read attachments on agenda items. Reuses the existing documents/storage
-- infrastructure rather than a parallel upload system: a pre-read is just a
-- regular documents row, tagged back to its source agenda item.

insert into document_folders (name, is_system) values ('Pre-reads', true)
on conflict (name) do nothing;

-- agenda_item_id is the durable identity link — an agenda item's row identity
-- never changes across defer/roll-forward (see rollForwardUnnotedAcknowledgements
-- and the 'defer'/'assign' actions in app/api/agenda-items/[id]/action/route.tsx,
-- which only ever update current_meeting_id on the same row), so a document
-- attached via agenda_item_id automatically "follows" the item for free.
--
-- meeting_id is a denormalized snapshot of the item's CURRENT meeting for
-- traceability/filtering convenience. It is NOT frozen at upload time — it's
-- kept in sync wherever agenda_items.current_meeting_id changes, so it always
-- reflects where the item (and its pre-read) currently sits, never the
-- original meeting date.
alter table documents
  add column if not exists agenda_item_id uuid references agenda_items(id) on delete set null,
  add column if not exists meeting_id uuid references meetings(id) on delete set null;

create index if not exists documents_agenda_item_id_idx on documents(agenda_item_id);
create index if not exists documents_meeting_id_idx on documents(meeting_id);

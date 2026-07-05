-- New system folder alongside the existing ones, per the same seed pattern
-- used for Pre-reads in migration 010.
insert into document_folders (name, is_system) values ('Constitution and By-laws', true)
on conflict (name) do nothing;

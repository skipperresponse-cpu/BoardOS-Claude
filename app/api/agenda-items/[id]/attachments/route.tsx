import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isAdminEquivalent } from '@/lib/roles'
import { logAudit } from '@/lib/audit'

// Pre-reads are just regular `documents` rows tagged with agenda_item_id —
// the same storage bucket/upload flow as the Documents module, just a
// different insert path since the submitter (often a plain board_member or
// advisor) isn't canManageDocuments and would fail the documents RLS policy
// via a direct client-side insert. Permission is checked here instead,
// mirroring the resolutions creation route's service-role pattern.
async function canManageAttachment(
  serviceSupabase: Awaited<ReturnType<typeof createServiceClient>>,
  agendaItemId: string,
  profileId: string,
  role: string | null | undefined
) {
  if (isAdminEquivalent(role)) return true
  const { data: item } = await serviceSupabase
    .from('agenda_items')
    .select('submitted_by')
    .eq('id', agendaItemId)
    .single()
  return item?.submitted_by === profileId
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const serviceSupabase = await createServiceClient()

  const { data: item } = await serviceSupabase
    .from('agenda_items')
    .select('id, current_meeting_id, submitted_by')
    .eq('id', id)
    .single()

  if (!item) return NextResponse.json({ error: 'Agenda item not found' }, { status: 404 })

  if (!(isAdminEquivalent(profile.role) || item.submitted_by === profile.id)) {
    return NextResponse.json({ error: 'Only the submitter, President, or Secretary can attach pre-reads' }, { status: 403 })
  }

  const { filePath, title } = await request.json()
  if (!filePath || !title?.trim()) {
    return NextResponse.json({ error: 'filePath and title are required' }, { status: 400 })
  }

  const { data: folder } = await serviceSupabase
    .from('document_folders')
    .select('id')
    .eq('name', 'Pre-reads')
    .single()

  const { data: doc, error } = await serviceSupabase
    .from('documents')
    .insert({
      title: title.trim(),
      category: 'Board Paper',
      file_path: filePath,
      uploaded_by: profile.id,
      folder_id: folder?.id ?? null,
      agenda_item_id: id,
      meeting_id: item.current_meeting_id,
      status: 'active',
    })
    .select('*, uploader:profiles!uploaded_by(full_name), folder:document_folders!folder_id(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  fetch(new URL('/api/documents/process', request.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentId: doc.id }),
  }).catch(() => {})

  await logAudit(profile.id, 'agenda_item_attachment_added', 'agenda_item', id, { documentId: doc.id, title: doc.title })

  return NextResponse.json(doc, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const documentId = searchParams.get('documentId')
  if (!documentId) return NextResponse.json({ error: 'documentId is required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const serviceSupabase = await createServiceClient()

  const { data: doc } = await serviceSupabase
    .from('documents')
    .select('id, file_path, title, agenda_item_id')
    .eq('id', documentId)
    .single()

  if (!doc || !doc.agenda_item_id) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })

  const allowed = await canManageAttachment(serviceSupabase, doc.agenda_item_id, profile.id, profile.role)
  if (!allowed) {
    return NextResponse.json({ error: 'Only the submitter, President, or Secretary can remove this attachment' }, { status: 403 })
  }

  await serviceSupabase.storage.from('governance-docs').remove([doc.file_path])
  const { error } = await serviceSupabase.from('documents').delete().eq('id', documentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(profile.id, 'agenda_item_attachment_removed', 'agenda_item', doc.agenda_item_id, { documentId, title: doc.title })

  return NextResponse.json({ success: true })
}

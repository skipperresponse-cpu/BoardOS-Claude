import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { canRecategorizeDocuments } from '@/lib/roles'
import { logAudit } from '@/lib/audit'

// Recategorisation is deliberately its own route, separate from the broader
// canManageDocuments document CRUD — President/Secretary only, not
// administrator, per canRecategorizeDocuments. The single entry point is the
// document detail page; no list/grid view calls this.
export async function PATCH(
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

  if (!profile || !canRecategorizeDocuments(profile.role)) {
    return NextResponse.json({ error: 'Only President or Secretary can move a document to a different folder' }, { status: 403 })
  }

  const { folderId } = await request.json()
  if (!folderId) return NextResponse.json({ error: 'folderId is required' }, { status: 400 })

  const serviceSupabase = await createServiceClient()

  const { data: folder } = await serviceSupabase
    .from('document_folders')
    .select('id, name')
    .eq('id', folderId)
    .single()

  if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 })

  const { data: doc } = await serviceSupabase
    .from('documents')
    .select('id, title, folder_id')
    .eq('id', id)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const { data: updated, error } = await serviceSupabase
    .from('documents')
    .update({ folder_id: folderId })
    .eq('id', id)
    .select('*, folder:document_folders!folder_id(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(profile.id, 'document_recategorized', 'document', id, {
    title: doc.title,
    from_folder_id: doc.folder_id,
    to_folder_id: folderId,
    to_folder_name: folder.name,
  })

  return NextResponse.json(updated)
}

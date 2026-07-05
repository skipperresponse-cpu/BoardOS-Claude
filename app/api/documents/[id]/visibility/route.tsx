import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isAdminEquivalent } from '@/lib/roles'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// Who can set/override a document's visibility group: the uploader, plus
// President/Secretary — not open to anyone with general document-manage
// rights (administrator can upload/archive/delete but not override
// visibility on someone else's document), per Task 2 of the brief.
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

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const serviceSupabase = await createServiceClient()

  const { data: doc } = await serviceSupabase
    .from('documents')
    .select('id, title, uploaded_by, visibility_group_id')
    .eq('id', id)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  if (!(isAdminEquivalent(profile.role) || doc.uploaded_by === profile.id)) {
    return NextResponse.json({ error: 'Only the uploader, President, or Secretary can change this document\'s visibility' }, { status: 403 })
  }

  const { visibilityGroupId } = await request.json()
  if (!visibilityGroupId) return NextResponse.json({ error: 'visibilityGroupId is required' }, { status: 400 })

  const { data: group } = await serviceSupabase.from('visibility_groups').select('id').eq('id', visibilityGroupId).single()
  if (!group) return NextResponse.json({ error: 'Visibility group not found' }, { status: 404 })

  const { data: updated, error } = await serviceSupabase
    .from('documents')
    .update({ visibility_group_id: visibilityGroupId })
    .eq('id', id)
    .select('*, visibility_group:visibility_groups!visibility_group_id(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(profile.id, 'document_visibility_changed', 'document', id, {
    title: doc.title,
    from_group_id: doc.visibility_group_id,
    to_group_id: visibilityGroupId,
  })

  return NextResponse.json(updated)
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canManageVisibilityGroups } from '@/lib/roles'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
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

  if (!profile || !canManageVisibilityGroups(profile.role)) {
    return NextResponse.json({ error: 'Only President or Secretary can delete a visibility group' }, { status: 403 })
  }

  const { data: group } = await supabase.from('visibility_groups').select('is_system, name').eq('id', id).single()
  if (group?.is_system) {
    return NextResponse.json({ error: 'System visibility groups cannot be deleted' }, { status: 400 })
  }

  const { error } = await supabase.from('visibility_groups').delete().eq('id', id)
  if (error) {
    // Referenced by a folder default or a document's visibility_group_id (both NOT NULL FKs).
    return NextResponse.json({ error: 'This group is still in use by a folder or document and cannot be deleted' }, { status: 409 })
  }

  await logAudit(profile.id, 'visibility_group_deleted', 'visibility_group', id, { name: group?.name })
  return NextResponse.json({ success: true })
}

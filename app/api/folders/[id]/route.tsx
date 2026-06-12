import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: folder } = await supabase
    .from('document_folders')
    .select('id, name, is_system')
    .eq('id', id)
    .single()

  if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
  if (folder.is_system) {
    return NextResponse.json({ error: 'System folders cannot be deleted' }, { status: 400 })
  }

  const { count } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('folder_id', id)

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'Folder must be empty before deleting' }, { status: 400 })
  }

  const { error } = await supabase
    .from('document_folders')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(profile.id, 'folder_deleted', 'document_folder', id, { name: folder.name })
  return NextResponse.json({ success: true })
}

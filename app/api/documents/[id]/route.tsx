import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
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

  const serviceSupabase = await createServiceClient()

  const { data: doc } = await serviceSupabase
    .from('documents')
    .select('id, file_path, title')
    .eq('id', id)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  // Remove from storage (non-fatal — the DB row is the source of truth)
  await serviceSupabase.storage.from('governance-docs').remove([doc.file_path])

  const { error } = await serviceSupabase
    .from('documents')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(profile.id, 'document_deleted', 'document', id, { title: doc.title })
  return NextResponse.json({ success: true })
}

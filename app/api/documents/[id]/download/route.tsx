import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceSupabase = await createServiceClient()

  const { data: doc } = await serviceSupabase
    .from('documents')
    .select('file_path')
    .eq('id', id)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const { data: urlData, error } = await serviceSupabase.storage
    .from('governance-docs')
    .createSignedUrl(doc.file_path, 3600)

  if (error || !urlData?.signedUrl) {
    return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 })
  }

  return NextResponse.redirect(urlData.signedUrl)
}

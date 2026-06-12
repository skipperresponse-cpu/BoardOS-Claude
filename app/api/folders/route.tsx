import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: folders, error } = await supabase
    .from('document_folders')
    .select('*')
    .order('is_system', { ascending: false })
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: docRows } = await supabase
    .from('documents')
    .select('folder_id')

  const countMap: Record<string, number> = {}
  docRows?.forEach((d: { folder_id: string | null }) => {
    if (d.folder_id) countMap[d.folder_id] = (countMap[d.folder_id] ?? 0) + 1
  })

  const result = (folders ?? []).map((f) => ({ ...f, document_count: countMap[f.id] ?? 0 }))
  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
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

  const { name } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { data: folder, error } = await supabase
    .from('document_folders')
    .insert({ name: name.trim(), is_system: false, created_by: profile.id })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A folder with that name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAudit(profile.id, 'folder_created', 'document_folder', folder.id, { name: folder.name })
  return NextResponse.json(folder, { status: 201 })
}

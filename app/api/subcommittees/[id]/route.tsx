import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canManageSubcommittees } from '@/lib/roles'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

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

  if (!profile || !canManageSubcommittees(profile.role)) {
    return NextResponse.json({ error: 'Only President or Secretary can edit a subcommittee' }, { status: 403 })
  }

  const { name, term_start, term_end, chair_user_id } = await request.json()

  const update: Record<string, unknown> = {}
  if (name !== undefined) update.name = name.trim()
  if (term_start !== undefined) update.term_start = term_start || null
  if (term_end !== undefined) update.term_end = term_end || null
  // Explicit chair change/clearing is the only way a chair's standing
  // meeting-management right ends — no date-driven auto-revocation.
  if (chair_user_id !== undefined) update.chair_user_id = chair_user_id || null

  const { data: updated, error } = await supabase
    .from('subcommittees')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(profile.id, 'subcommittee_updated', 'subcommittee', id, update)
  return NextResponse.json(updated)
}

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

  if (!profile || !canManageSubcommittees(profile.role)) {
    return NextResponse.json({ error: 'Only President or Secretary can delete a subcommittee' }, { status: 403 })
  }

  const { error } = await supabase.from('subcommittees').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(profile.id, 'subcommittee_deleted', 'subcommittee', id, {})
  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canManageVisibilityGroups } from '@/lib/roles'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id, memberId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile || !canManageVisibilityGroups(profile.role)) {
    return NextResponse.json({ error: 'Only President or Secretary can manage group membership' }, { status: 403 })
  }

  const { error } = await supabase
    .from('visibility_group_members')
    .delete()
    .eq('id', memberId)
    .eq('visibility_group_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(profile.id, 'visibility_group_member_removed', 'visibility_group', id, { member_id: memberId })
  return NextResponse.json({ success: true })
}

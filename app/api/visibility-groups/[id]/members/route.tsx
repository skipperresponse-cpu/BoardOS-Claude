import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canManageVisibilityGroups } from '@/lib/roles'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

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

  if (!profile || !canManageVisibilityGroups(profile.role)) {
    return NextResponse.json({ error: 'Only President or Secretary can manage group membership' }, { status: 403 })
  }

  const { data: group } = await supabase.from('visibility_groups').select('membership_type').eq('id', id).single()
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  if (group.membership_type !== 'static') {
    return NextResponse.json({ error: 'Only static groups have directly-managed membership' }, { status: 400 })
  }

  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

  const { data: member, error } = await supabase
    .from('visibility_group_members')
    .insert({ visibility_group_id: id, user_id: userId })
    .select('*, profile:profiles!user_id(id, full_name)')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This person is already a member of this group' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAudit(profile.id, 'visibility_group_member_added', 'visibility_group', id, { userId })
  return NextResponse.json(member, { status: 201 })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canDelegateMeetingRights } from '@/lib/roles'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const DELEGATION_DURATION_DAYS = 14

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

  if (!profile || !canDelegateMeetingRights(profile.role)) {
    return NextResponse.json({ error: 'Only President or Secretary can delegate meeting rights' }, { status: 403 })
  }

  const { delegatedToUserId } = await request.json()
  if (!delegatedToUserId) return NextResponse.json({ error: 'delegatedToUserId is required' }, { status: 400 })

  const { data: target } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', delegatedToUserId)
    .single()

  if (!target || target.role !== 'board_member' && target.role !== 'treasurer') {
    return NextResponse.json({ error: 'Delegation is only for board-level users (board member or treasurer)' }, { status: 400 })
  }

  const grantedAt = new Date()
  const expiresAt = new Date(grantedAt.getTime() + DELEGATION_DURATION_DAYS * 24 * 60 * 60 * 1000)

  const { data: delegation, error } = await supabase
    .from('meeting_delegations')
    .insert({
      meeting_id: id,
      delegated_to_user_id: delegatedToUserId,
      granted_by_user_id: profile.id,
      granted_at: grantedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select('*, delegated_to:profiles!delegated_to_user_id(id, full_name), granted_by:profiles!granted_by_user_id(id, full_name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(profile.id, 'meeting_rights_delegated', 'meeting', id, {
    delegated_to: delegatedToUserId,
    expires_at: expiresAt.toISOString(),
  })

  return NextResponse.json(delegation, { status: 201 })
}

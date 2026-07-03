import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { canManageMeetings, isAdminEquivalent } from '@/lib/roles'
import {
  isValidForwardTransition, isManualReopenTransition, canCancelFrom, applyMeetingTransition,
} from '@/lib/meetings/transition'

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

  if (!profile || !canManageMeetings(profile.role)) {
    return NextResponse.json({ error: 'Meeting management access required' }, { status: 403 })
  }

  const { toStatus } = await request.json()
  if (!toStatus) return NextResponse.json({ error: 'toStatus is required' }, { status: 400 })

  const serviceSupabase = await createServiceClient()
  const { data: meeting } = await serviceSupabase
    .from('meetings')
    .select('id, status')
    .eq('id', id)
    .single()

  if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })

  const from = meeting.status

  if (toStatus === 'cancelled') {
    if (!canCancelFrom(from)) {
      return NextResponse.json({ error: `Cannot cancel a meeting in status "${from}"` }, { status: 400 })
    }
  } else if (isManualReopenTransition(from, toStatus)) {
    if (!isAdminEquivalent(profile.role)) {
      return NextResponse.json({ error: 'Only President/Secretary can reopen the agenda' }, { status: 403 })
    }
  } else if (!isValidForwardTransition(from, toStatus)) {
    return NextResponse.json({ error: `Cannot move from "${from}" to "${toStatus}"` }, { status: 400 })
  }

  try {
    await applyMeetingTransition(id, toStatus, profile.id)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Transition failed' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, status: toStatus })
}

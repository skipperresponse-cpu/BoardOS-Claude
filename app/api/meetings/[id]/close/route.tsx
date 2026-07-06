import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { canManageThisMeeting } from '@/lib/meetings/permissions'
import { logAudit } from '@/lib/audit'

// Close Meeting: finalizes a meeting that Start Meeting put in progress.
// Blocks if any discussion/approval_request item attached to the meeting is
// still awaiting resolution (submitted/approved/edited_approved) — the
// president/secretary must mark it discussed or defer it via the existing
// agenda review UI first, rather than closing with items silently dropped.
// Once clear: sets is_in_progress back to false (status stays 'held') and
// applies absentee logic to required attendees only, per the brief.
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

  if (!profile || !(await canManageThisMeeting(profile.id, profile.role, id))) {
    return NextResponse.json({ error: 'Meeting management access required' }, { status: 403 })
  }

  const serviceSupabase = await createServiceClient()
  const { data: meeting } = await serviceSupabase
    .from('meetings')
    .select('id, status, is_in_progress')
    .eq('id', id)
    .single()

  if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })

  if (meeting.status !== 'held' || !meeting.is_in_progress) {
    return NextResponse.json({ error: 'Meeting is not currently in progress' }, { status: 400 })
  }

  const { count: unresolvedCount } = await serviceSupabase
    .from('agenda_items')
    .select('id', { count: 'exact', head: true })
    .eq('current_meeting_id', id)
    .in('status', ['submitted', 'approved', 'edited_approved'])

  if (unresolvedCount && unresolvedCount > 0) {
    return NextResponse.json(
      { error: `${unresolvedCount} agenda item(s) still need to be marked discussed or deferred before closing this meeting.` },
      { status: 400 }
    )
  }

  // Absentee logic finalizes here, not before: required attendees not marked
  // present become absent; optional attendees left unconfirmed stay
  // unconfirmed (no absent flag); guests are never marked absent at all.
  const { error: absenteeErr } = await serviceSupabase
    .from('meeting_attendees')
    .update({ attended: false })
    .eq('meeting_id', id)
    .eq('attendance_requirement', 'required')
    .is('attended', null)

  if (absenteeErr) return NextResponse.json({ error: absenteeErr.message }, { status: 500 })

  const { error: closeErr } = await serviceSupabase
    .from('meetings')
    .update({ is_in_progress: false })
    .eq('id', id)

  if (closeErr) return NextResponse.json({ error: closeErr.message }, { status: 500 })

  await logAudit(profile.id, 'meeting_closed', 'meeting', id, {})

  return NextResponse.json({ success: true })
}

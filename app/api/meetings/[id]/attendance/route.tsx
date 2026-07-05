import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { canManageThisMeeting } from '@/lib/meetings/permissions'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// Confirms who actually attended (post-meeting), distinct from who was
// invited/listed — same manage-this-meeting right as agenda/status actions
// (blanket tier, standing subcommittee chair, or an active ad hoc delegate).
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

  if (!profile || !(await canManageThisMeeting(profile.id, profile.role, id))) {
    return NextResponse.json({ error: 'Meeting management access required' }, { status: 403 })
  }

  const { type, id: rowId, attended } = await request.json()
  if (!type || !rowId || typeof attended !== 'boolean') {
    return NextResponse.json({ error: 'type, id, and attended are required' }, { status: 400 })
  }
  if (type !== 'attendee' && type !== 'guest') {
    return NextResponse.json({ error: 'type must be "attendee" or "guest"' }, { status: 400 })
  }

  const serviceSupabase = await createServiceClient()
  const table = type === 'attendee' ? 'meeting_attendees' : 'meeting_guests'

  const { data: updated, error } = await serviceSupabase
    .from(table)
    .update({ attended })
    .eq('id', rowId)
    .eq('meeting_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(profile.id, 'meeting_attendance_confirmed', 'meeting', id, { type, rowId, attended })

  return NextResponse.json(updated)
}

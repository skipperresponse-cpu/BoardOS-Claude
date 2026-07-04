import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { canSubmitAgendaItems } from '@/lib/roles'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const meetingId = searchParams.get('meeting_id')
  const unassigned = searchParams.get('unassigned') === 'true'

  let query = supabase
    .from('agenda_items')
    .select('*, submitter:profiles!submitted_by(full_name)')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (unassigned) {
    query = query.is('current_meeting_id', null)
  } else if (meetingId) {
    query = query.eq('current_meeting_id', meetingId)
  } else {
    return NextResponse.json({ error: 'meeting_id or unassigned=true is required' }, { status: 400 })
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
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

  if (!profile || !canSubmitAgendaItems(profile.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { meetingId, title, description } = await request.json()
  if (!meetingId || !title?.trim()) {
    return NextResponse.json({ error: 'meetingId and title are required' }, { status: 400 })
  }

  const serviceSupabase = await createServiceClient()

  const { data: meeting } = await serviceSupabase
    .from('meetings')
    .select('id, status')
    .eq('id', meetingId)
    .single()

  if (!meeting || meeting.status !== 'agenda_open') {
    return NextResponse.json({ error: 'This meeting is not accepting agenda submissions' }, { status: 400 })
  }

  const { data: item, error } = await serviceSupabase
    .from('agenda_items')
    .insert({
      type: 'discussion',
      current_meeting_id: meetingId,
      submitted_by: profile.id,
      title: title.trim(),
      description: description?.trim() || null,
      status: 'submitted',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await serviceSupabase.from('agenda_item_queue_history').insert({
    agenda_item_id: item.id,
    from_meeting_id: null,
    to_meeting_id: meetingId,
    reason: 'initial_submission',
  })

  return NextResponse.json(item, { status: 201 })
}

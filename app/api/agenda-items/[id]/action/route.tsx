import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isAdminEquivalent } from '@/lib/roles'
import { logAudit } from '@/lib/audit'

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

  if (!profile || !isAdminEquivalent(profile.role)) {
    return NextResponse.json({ error: 'President/Secretary access required' }, { status: 403 })
  }

  const { action, editedTitle, editedDescription, deferToMeetingId, assignToMeetingId } = await request.json()
  if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 })

  const serviceSupabase = await createServiceClient()

  const { data: item } = await serviceSupabase
    .from('agenda_items')
    .select('id, current_meeting_id, type')
    .eq('id', id)
    .single()

  if (!item) return NextResponse.json({ error: 'Agenda item not found' }, { status: 404 })

  // 'assign' (pulling an unassigned depository item into the meeting currently
  // being built) has its own rules and doesn't go through the review-window
  // check below — handle it first and return early.
  if (action === 'assign') {
    if (!assignToMeetingId) return NextResponse.json({ error: 'assignToMeetingId is required' }, { status: 400 })
    if (item.current_meeting_id !== null) {
      return NextResponse.json({ error: 'Item is already attached to a meeting' }, { status: 400 })
    }

    const { data: updated, error } = await serviceSupabase
      .from('agenda_items')
      .update({ current_meeting_id: assignToMeetingId })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await serviceSupabase.from('agenda_item_queue_history').insert({
      agenda_item_id: id,
      from_meeting_id: null,
      to_meeting_id: assignToMeetingId,
      reason: 'manually_assigned',
    })

    // Pre-read attachments are tagged with the item's CURRENT meeting for
    // traceability — keep that snapshot in sync whenever the item moves.
    await serviceSupabase.from('documents').update({ meeting_id: assignToMeetingId }).eq('agenda_item_id', id)

    if (item.type === 'acknowledgement') {
      const { data: ackItem } = await serviceSupabase.from('agenda_items').select('resolution_id').eq('id', id).single()
      if (ackItem?.resolution_id) {
        await serviceSupabase.from('resolutions').update({ queued_for_meeting_id: assignToMeetingId }).eq('id', ackItem.resolution_id)
      }
    }

    await logAudit(profile.id, 'agenda_item_assigned', 'agenda_item', id, { assignToMeetingId })
    return NextResponse.json(updated)
  }

  if (item.type !== 'discussion' && item.type !== 'approval_request') {
    return NextResponse.json({ error: 'Acknowledgement items cannot be reviewed' }, { status: 400 })
  }

  // Defense in depth alongside RLS: an item currently attached to a meeting
  // may only be reviewed while that meeting is in its review window. An
  // unassigned depository item (current_meeting_id null) has no such window —
  // president/secretary can reject it directly from the depository.
  if (item.current_meeting_id !== null) {
    const { data: meeting } = await serviceSupabase
      .from('meetings')
      .select('status')
      .eq('id', item.current_meeting_id)
      .single()

    if (!meeting || !['agenda_locked', 'scheduled'].includes(meeting.status)) {
      return NextResponse.json({ error: 'This meeting is not in its agenda review window' }, { status: 400 })
    }
  }

  let update: Record<string, unknown>

  switch (action) {
    case 'approve':
      update = { status: 'approved' }
      break
    case 'edit_approve':
      if (!editedTitle?.trim()) {
        return NextResponse.json({ error: 'editedTitle is required for edit_approve' }, { status: 400 })
      }
      update = {
        status: 'edited_approved',
        title: editedTitle.trim(),
        description: editedDescription?.trim() || null,
      }
      break
    case 'reject':
      update = { status: 'rejected' }
      break
    case 'defer': {
      const toMeetingId = deferToMeetingId || null
      update = { status: 'deferred', current_meeting_id: toMeetingId }
      await serviceSupabase.from('agenda_item_queue_history').insert({
        agenda_item_id: id,
        from_meeting_id: item.current_meeting_id,
        to_meeting_id: toMeetingId,
        reason: 'deferred',
      })
      await serviceSupabase.from('documents').update({ meeting_id: toMeetingId }).eq('agenda_item_id', id)
      break
    }
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }

  const { data: updated, error } = await serviceSupabase
    .from('agenda_items')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(profile.id, `agenda_item_${action}`, 'agenda_item', id, { action })

  return NextResponse.json(updated)
}

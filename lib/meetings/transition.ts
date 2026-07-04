import { createServiceClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { sendAgendaOpenReminder } from '@/lib/email/reminders'

export const MEETING_STATUS_LADDER = [
  'draft', 'agenda_open', 'agenda_locked', 'scheduled', 'held', 'minutes_drafted', 'minutes_approved',
] as const

export type LadderStatus = typeof MEETING_STATUS_LADDER[number]

/** The one manual backward exception: agenda_locked -> agenda_open, President/Secretary only. */
export function isManualReopenTransition(from: string, to: string): boolean {
  return from === 'agenda_locked' && to === 'agenda_open'
}

export function isValidForwardTransition(from: string, to: string): boolean {
  const fromIdx = MEETING_STATUS_LADDER.indexOf(from as LadderStatus)
  const toIdx = MEETING_STATUS_LADDER.indexOf(to as LadderStatus)
  if (fromIdx === -1 || toIdx === -1) return false
  return toIdx === fromIdx + 1
}

/** A meeting can be cancelled from any status except the terminal ones. */
export function canCancelFrom(status: string): boolean {
  return status !== 'cancelled' && status !== 'minutes_approved'
}

/**
 * Applies a meeting status transition using the service client (bypasses RLS —
 * caller is responsible for authorization before calling this). Pass
 * actorProfileId to audit-log a human-triggered transition; omit it for the
 * automatic deadline-passed flip, which is a deterministic system fact rather
 * than a privileged action.
 */
export async function applyMeetingTransition(
  meetingId: string,
  toStatus: string,
  actorProfileId?: string
) {
  const serviceSupabase = await createServiceClient()
  const { error } = await serviceSupabase
    .from('meetings')
    .update({ status: toStatus })
    .eq('id', meetingId)

  if (error) throw new Error(error.message)

  if (actorProfileId) {
    await logAudit(actorProfileId, 'meeting_status_changed', 'meeting', meetingId, { to: toStatus })
  }

  // Agenda just opened for submissions — notify everyone who can submit.
  if (toStatus === 'agenda_open') {
    const { data: meeting } = await serviceSupabase
      .from('meetings')
      .select('id, title, agenda_deadline')
      .eq('id', meetingId)
      .single()
    if (meeting) await sendAgendaOpenReminder(meeting)
  }

  // Minutes finalised: every acknowledgement item still attached to this
  // meeting is now noted, and its resolution is permanently ratified here.
  // Runs before the roll-forward check below so nothing attached at this
  // point gets rolled forward instead of noted.
  if (toStatus === 'minutes_approved') {
    await noteAcknowledgements(meetingId)
  }

  // Roll-forward check: only meaningful at 'cancelled' (this meeting will
  // never produce minutes, so anything still attached must move on) and at
  // 'minutes_approved' (a defensive safety net — under normal operation the
  // minutes-finalisation flow marks every attached acknowledgement 'noted' in
  // the same step, so this is a no-op then, but guards any item that ended up
  // attached to an already-finalised meeting through some other path).
  // Deliberately NOT checked at 'held': that fires before minutes are ever
  // drafted, so every attached acknowledgement would still be unnoted at that
  // instant — checking there would roll everything forward immediately and
  // defeat the entire mechanism, rather than actually being "the meeting
  // didn't get to it."
  if (toStatus === 'cancelled' || toStatus === 'minutes_approved') {
    await rollForwardUnnotedAcknowledgements(meetingId)
  }
}

/**
 * Marks every acknowledgement-type agenda_item attached to this meeting as
 * 'noted' and permanently ratifies its linked resolution against this
 * meeting. Called when minutes are finalised (minutes_drafted -> minutes_approved).
 */
async function noteAcknowledgements(meetingId: string) {
  const serviceSupabase = await createServiceClient()

  const { data: items } = await serviceSupabase
    .from('agenda_items')
    .select('id, resolution_id')
    .eq('current_meeting_id', meetingId)
    .eq('type', 'acknowledgement')
    .neq('status', 'noted')

  if (!items || items.length === 0) return

  for (const item of items) {
    await serviceSupabase.from('agenda_items').update({ status: 'noted' }).eq('id', item.id)
    if (item.resolution_id) {
      await serviceSupabase
        .from('resolutions')
        .update({ ratified_at_meeting_id: meetingId, status: 'noted' })
        .eq('id', item.resolution_id)
    }
  }
}

/**
 * Finds acknowledgement-type agenda_items still attached to this meeting that
 * were never marked 'noted', detaches them, records the move in
 * agenda_item_queue_history, and re-queues each exactly like initial queuing
 * (attach to the next draft/agenda_open meeting, or leave unassigned for the
 * Outstanding Agenda depository).
 */
async function rollForwardUnnotedAcknowledgements(meetingId: string) {
  const serviceSupabase = await createServiceClient()

  const { data: items } = await serviceSupabase
    .from('agenda_items')
    .select('id, resolution_id')
    .eq('current_meeting_id', meetingId)
    .eq('type', 'acknowledgement')
    .neq('status', 'noted')

  if (!items || items.length === 0) return

  const { data: nextMeeting } = await serviceSupabase
    .from('meetings')
    .select('id')
    .in('status', ['draft', 'agenda_open'])
    .order('meeting_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  const nextMeetingId = nextMeeting?.id ?? null

  for (const item of items) {
    await serviceSupabase
      .from('agenda_items')
      .update({ current_meeting_id: nextMeetingId })
      .eq('id', item.id)

    await serviceSupabase.from('agenda_item_queue_history').insert({
      agenda_item_id: item.id,
      from_meeting_id: meetingId,
      to_meeting_id: nextMeetingId,
      reason: 'rolled_forward',
    })

    if (item.resolution_id) {
      await serviceSupabase
        .from('resolutions')
        .update({ queued_for_meeting_id: nextMeetingId })
        .eq('id', item.resolution_id)
    }
  }
}

/**
 * Checks whether an agenda_open meeting's submission deadline has passed and,
 * if so, flips it to agenda_locked. Called on read (page load), per design —
 * no scheduled job. Returns the possibly-updated status.
 */
export async function autoLockAgendaIfDeadlinePassed(meeting: {
  id: string
  status: string
  agenda_deadline: string | null
}): Promise<string> {
  if (
    meeting.status === 'agenda_open' &&
    meeting.agenda_deadline &&
    new Date(meeting.agenda_deadline) < new Date()
  ) {
    await applyMeetingTransition(meeting.id, 'agenda_locked')
    return 'agenda_locked'
  }
  return meeting.status
}

import { createServiceClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

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

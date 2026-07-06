// Pure meeting-status-ladder logic — no server-only imports (no Supabase
// client, no next/headers), so this is safe to import from client
// components. lib/meetings/transition.ts (applyMeetingTransition and
// friends) is server-only and re-exports these for server-side callers.

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
 * Whether a meeting's agenda is still within its review/approval window —
 * i.e. anything before Held. Agenda items can only ever be submitted while
 * Agenda Open, but per the agenda-approval brief, president/secretary can
 * approve/edit/reject/defer them in real time throughout Open, Locked, and
 * Scheduled — not gated to "only after lock" — right up until the meeting
 * is marked Held, matching the existing "edits allowed until Held" rule.
 */
export function isBeforeHeld(status: string): boolean {
  const idx = MEETING_STATUS_LADDER.indexOf(status as LadderStatus)
  const heldIdx = MEETING_STATUS_LADDER.indexOf('held')
  return idx !== -1 && idx < heldIdx
}

/**
 * The full agenda review/action window: everything isBeforeHeld covers,
 * PLUS a meeting that Start Meeting has put "in progress" (status held,
 * is_in_progress true) — covers items still needing action (approve/
 * reject/defer/mark discussed) once the meeting has actually started, up
 * until Close Meeting finalizes it (is_in_progress false).
 */
export function isWithinAgendaReviewWindow(status: string, isInProgress: boolean): boolean {
  return isBeforeHeld(status) || (status === 'held' && isInProgress)
}

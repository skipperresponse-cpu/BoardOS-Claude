import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isPast } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date | null): string {
  if (!date) return '—'
  return format(new Date(date), 'dd MMM yyyy')
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return '—'
  return format(new Date(date), 'dd MMM yyyy, h:mm a')
}

export function timeAgo(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  return isPast(new Date(dueDate))
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + '...'
}

/** Today's date as a yyyy-MM-dd string, for pre-filling <input type="date"> so it defaults to today instead of blank. */
export function todayDateString(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** "09:00", "09:30", "10:00", ... "23:30" — every meeting time picker is restricted to these, no free-text minutes. */
export const MEETING_TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2)
  const minutes = i % 2 === 0 ? '00' : '30'
  return `${String(hours).padStart(2, '0')}:${minutes}`
})

export const DEFAULT_MEETING_TIME = '09:00'

export function formatTimeOption(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

export const DOCUMENT_CATEGORIES = [
  'Constitution',
  'By-laws',
  'SOP',
  'Policy',
  'Board Minutes',
  'Board Paper',
  'AGM',
  'Finance',
  'HR',
  'Regulatory',
  'Grant',
  'Correspondence',
  'Other',
] as const

export const ACTION_STATUS_COLORS: Record<string, string> = {
  'Not Started': 'bg-slate-100 text-slate-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  Done: 'bg-green-100 text-green-700',
  Blocked: 'bg-red-100 text-red-700',
}

export const MEETING_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  agenda_open: 'bg-blue-100 text-blue-700',
  agenda_locked: 'bg-amber-100 text-amber-700',
  scheduled: 'bg-indigo-100 text-indigo-700',
  held: 'bg-teal-100 text-teal-700',
  minutes_drafted: 'bg-yellow-100 text-yellow-700',
  minutes_approved: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

export const MEETING_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  agenda_open: 'Agenda Open',
  agenda_locked: 'Agenda Locked',
  scheduled: 'Scheduled',
  held: 'Held',
  minutes_drafted: 'Minutes Drafted',
  minutes_approved: 'Minutes Approved',
  cancelled: 'Cancelled',
}

// 'held' covers both "Start Meeting has been clicked and it's actively
// running" and "Close Meeting has finalized it" — is_in_progress distinguishes
// the two for display, since the status column alone doesn't.
export function meetingStatusLabel(status: string, isInProgress: boolean): string {
  if (status === 'held' && isInProgress) return 'In Progress'
  return MEETING_STATUS_LABELS[status] ?? status
}

export function meetingStatusColor(status: string, isInProgress: boolean): string {
  if (status === 'held' && isInProgress) return 'bg-orange-100 text-orange-700'
  return MEETING_STATUS_COLORS[status] ?? ''
}

export const APPROVAL_STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  paused: 'bg-yellow-100 text-yellow-700',
  closed: 'bg-slate-100 text-slate-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  archived: 'bg-slate-100 text-slate-500',
}

export const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'text-green-700 bg-green-50',
  medium: 'text-yellow-700 bg-yellow-50',
  low: 'text-orange-700 bg-orange-50',
  insufficient: 'text-red-700 bg-red-50',
}

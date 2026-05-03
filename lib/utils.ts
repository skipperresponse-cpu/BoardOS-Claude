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

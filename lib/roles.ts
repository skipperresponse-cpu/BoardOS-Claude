import type { UserRole } from '@/types'

export type RoleTier = 'admin_equivalent' | 'board' | 'administrator' | 'advisor' | 'viewer'

export const ALL_ROLES: UserRole[] = [
  'president', 'secretary', 'treasurer', 'board_member', 'administrator', 'advisor', 'viewer',
]

export const ROLE_TIER: Record<UserRole, RoleTier> = {
  president: 'admin_equivalent',
  secretary: 'admin_equivalent',
  treasurer: 'board',
  board_member: 'board',
  administrator: 'administrator',
  advisor: 'advisor',
  viewer: 'viewer',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  president: 'President',
  secretary: 'Secretary',
  treasurer: 'Treasurer',
  board_member: 'Board Member',
  administrator: 'Administrator',
  advisor: 'Advisor',
  viewer: 'Viewer',
}

export const ROLE_COLORS: Record<UserRole, string> = {
  president: 'bg-purple-100 text-purple-700',
  secretary: 'bg-purple-100 text-purple-700',
  treasurer: 'bg-blue-100 text-blue-700',
  board_member: 'bg-blue-100 text-blue-700',
  administrator: 'bg-teal-100 text-teal-700',
  advisor: 'bg-amber-100 text-amber-700',
  viewer: 'bg-slate-100 text-slate-600',
}

function tierOf(role: string | null | undefined): RoleTier | null {
  if (!role) return null
  return ROLE_TIER[role as UserRole] ?? null
}

/** President/Secretary — full admin-equivalent access to everything. */
export function isAdminEquivalent(role: string | null | undefined): boolean {
  return tierOf(role) === 'admin_equivalent'
}

/** Board-tier roles: board_member, treasurer (treasurer is label-only, same RLS as board_member). */
export function isBoardTier(role: string | null | undefined): boolean {
  return tierOf(role) === 'board'
}

/** Documents: full CRUD (upload/archive/categorize). Admin-equivalent + administrator only. */
export function canManageDocuments(role: string | null | undefined): boolean {
  const t = tierOf(role)
  return t === 'admin_equivalent' || t === 'administrator'
}

/** Documents: read access (active docs). Everyone except advisor/viewer. */
export function canReadDocuments(role: string | null | undefined): boolean {
  const t = tierOf(role)
  return t === 'admin_equivalent' || t === 'administrator' || t === 'board'
}

/** Meetings: full CRUD incl. status transitions (create, edit, generate minutes) — NOT the agenda sign-off step. */
export function canManageMeetings(role: string | null | undefined): boolean {
  const t = tierOf(role)
  return t === 'admin_equivalent' || t === 'administrator'
}

/** Meetings: read access. Everyone except viewer (advisor/administrator need this to submit agenda items). */
export function canReadMeetings(role: string | null | undefined): boolean {
  return tierOf(role) !== 'viewer' && tierOf(role) !== null
}

/** Action items: full CRUD (create/assign/edit). Admin-equivalent, administrator, and board tier. */
export function canManageActionItems(role: string | null | undefined): boolean {
  const t = tierOf(role)
  return t === 'admin_equivalent' || t === 'administrator' || t === 'board'
}

/** Approvals: vote and close/approve board resolutions. Admin-equivalent + board tier only — NOT administrator/advisor. */
export function canVoteApprovals(role: string | null | undefined): boolean {
  const t = tierOf(role)
  return t === 'admin_equivalent' || t === 'board'
}

/** Agenda review sign-off (approve/edit/defer/reject during Agenda Locked). President/Secretary only. */
export function canApproveAgendaItems(role: string | null | undefined): boolean {
  return tierOf(role) === 'admin_equivalent'
}

/** Submit new agenda items while a meeting is Agenda Open. Everyone except viewer. */
export function canSubmitAgendaItems(role: string | null | undefined): boolean {
  const t = tierOf(role)
  return t === 'admin_equivalent' || t === 'board' || t === 'administrator' || t === 'advisor'
}

/** Admin panel: invite/create/manage users and roles. President/Secretary only. */
export function canManageUsers(role: string | null | undefined): boolean {
  return tierOf(role) === 'admin_equivalent'
}

/** AI features (Ask, minutes generation, etc). Everyone except viewer, matching current AI access gate. */
export function canUseAI(role: string | null | undefined): boolean {
  return tierOf(role) !== 'viewer' && tierOf(role) !== null
}

/**
 * Flag an approved decision for formalisation as a resolution. A narrow,
 * specific permission — NOT a tier — since treasurer (board tier) and
 * administrator (administrator tier) both get this one elevated action
 * while keeping their tiers unchanged everywhere else.
 */
export function canFlagForResolution(role: string | null | undefined): boolean {
  return role === 'president' || role === 'secretary' || role === 'treasurer' || role === 'administrator'
}

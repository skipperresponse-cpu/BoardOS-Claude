import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatDateTime, meetingStatusColor, meetingStatusLabel } from '@/lib/utils'
import { autoLockAgendaIfDeadlinePassed } from '@/lib/meetings/transition'
import { canManageThisMeeting } from '@/lib/meetings/permissions'
import { isAdminEquivalent } from '@/lib/roles'
import { MeetingDetailClient } from './meeting-detail-client'
import { AgendaItemsClient } from './agenda-items-client'
import { MeetingDelegationControl } from './meeting-delegation-control'
import { AttendanceConfirmation } from './attendance-confirmation'

interface Props {
  params: Promise<{ id: string }>
}

export default async function MeetingDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  const { data: meeting } = await supabase
    .from('meetings')
    .select('*, creator:profiles!created_by(full_name), subcommittee:subcommittees!subcommittee_id(id, name)')
    .eq('id', id)
    .single()

  if (!meeting) notFound()

  // On-read check: flip agenda_open -> agenda_locked if the deadline has passed.
  // No cron job — computed dynamically whenever the meeting is viewed.
  const currentStatus = await autoLockAgendaIfDeadlinePassed(meeting)
  if (currentStatus !== meeting.status) meeting.status = currentStatus

  const [
    { data: actionItems },
    { data: profiles },
    { data: agendaItems },
    { data: attendees },
    { data: guests },
    { data: delegations },
  ] = await Promise.all([
    supabase.from('action_items').select('*, owner:profiles!owner_user_id(full_name)').eq('meeting_id', id).order('created_at'),
    supabase.from('profiles').select('id, full_name, role').order('full_name'),
    supabase
      .from('agenda_items')
      .select('*, submitter:profiles!submitted_by(full_name), resolution:resolutions(*), attachments:documents!agenda_item_id(*)')
      .eq('current_meeting_id', id)
      .order('display_order')
      .order('created_at'),
    supabase.from('meeting_attendees').select('*, profile:profiles!user_id(id, full_name, role), subcommittee_member:subcommittee_members!subcommittee_member_id(id, external_name, external_affiliation)').eq('meeting_id', id),
    supabase.from('meeting_guests').select('*').eq('meeting_id', id),
    supabase
      .from('meeting_delegations')
      .select('*, delegated_to:profiles!delegated_to_user_id(id, full_name), granted_by:profiles!granted_by_user_id(id, full_name)')
      .eq('meeting_id', id)
      .order('granted_at', { ascending: false }),
  ])

  // BUG FIX: this used to be `agendaItems.length > 0`, which meant the entire
  // agenda-contribution UI (submit/edit/approve/defer/reject) never rendered
  // for any meeting that hadn't yet received its first agenda item — an
  // impossible starting condition for every meeting, since "no items yet" is
  // the normal state the moment a meeting opens for submissions. That silently
  // hid the agenda UI even for president/secretary with full rights (reported
  // by Daniel on "Board Meeting 2": agenda_open status, zero agenda_items).
  // A meeting is only "legacy" (show the old read-only agenda_json list) if
  // it has old JSON agenda data AND has never received any new-system item —
  // i.e. it predates the agenda_items feature and was never touched by it.
  const agendaItemsList = agendaItems ?? []
  const legacyAgenda = meeting.agenda_json as { id?: string; title?: string; item?: string }[] | null
  const isLegacyAgendaOnly = agendaItemsList.length === 0 && (legacyAgenda?.length ?? 0) > 0
  const acknowledgementItems = agendaItemsList.filter((a) => a.type === 'acknowledgement')

  const canManageMeeting = profile ? await canManageThisMeeting(profile.id, profile.role, id) : false

  const attendeesList = attendees ?? []
  const guestsList = guests ?? []
  // Legacy meetings (predating this feature) only have attendees_json name
  // strings and no meeting_attendees/meeting_guests rows at all.
  const hasNewAttendance = attendeesList.length > 0 || guestsList.length > 0
  const legacyAttendeeNames = meeting.attendees_json as string[] | null

  const isHeldOrLater = ['held', 'minutes_drafted', 'minutes_approved'].includes(meeting.status)

  // For the AI minutes prompt: prefer confirmed attendance over the legacy
  // frozen snapshot. "Present" = anyone not explicitly marked absent (covers
  // the common case where attendance hasn't been confirmed yet).
  const attendeeName = (a: (typeof attendeesList)[number]) => a.profile?.full_name ?? a.subcommittee_member?.external_name ?? '—'
  const attendeeNames = hasNewAttendance
    ? [
        ...attendeesList.filter((a) => a.attended !== false).map(attendeeName),
        ...guestsList.filter((g) => g.attended !== false).map((g) => g.name),
      ]
    : (legacyAttendeeNames ?? [])
  const absentNames = hasNewAttendance
    ? [
        ...attendeesList.filter((a) => a.attended === false).map(attendeeName),
        ...guestsList.filter((g) => g.attended === false).map((g) => g.name),
      ]
    : (meeting.absentees_json as string[] | null ?? [])

  const activeDelegation = (delegations ?? []).find((d) => new Date(d.expires_at) > new Date()) ?? null
  const boardTierProfiles = (profiles ?? []).filter((p) => p.role === 'board_member' || p.role === 'treasurer')

  return (
    <div>
      <Header
        title={meeting.title}
        description={formatDate(meeting.meeting_date)}
        action={<Badge className={meetingStatusColor(meeting.status, meeting.is_in_progress)}>{meetingStatusLabel(meeting.status, meeting.is_in_progress)}</Badge>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Agenda</CardTitle></CardHeader>
            <CardContent>
              {isLegacyAgendaOnly ? (
                <ol className="text-sm text-slate-800 space-y-1 list-decimal list-inside">
                  {legacyAgenda!.map((a, i) => (
                    <li key={a.id ?? i}>{a.title ?? a.item}</li>
                  ))}
                </ol>
              ) : (
                <AgendaItemsClient
                  meetingId={id}
                  meetingStatus={meeting.status}
                  isInProgress={meeting.is_in_progress}
                  items={agendaItemsList}
                  userRole={profile?.role ?? 'viewer'}
                  currentProfileId={profile?.id ?? ''}
                  canManageThisMeeting={canManageMeeting}
                />
              )}
            </CardContent>
          </Card>

          <MeetingDetailClient
            meeting={meeting}
            actionItems={actionItems ?? []}
            profiles={profiles ?? []}
            userRole={profile?.role ?? 'viewer'}
            currentProfileId={profile?.id ?? ''}
            acknowledgementItems={acknowledgementItems}
            canManageThisMeeting={canManageMeeting}
            attendeeNames={attendeeNames}
            absentNames={absentNames}
          />

          {isHeldOrLater && hasNewAttendance && (
            <AttendanceConfirmation
              meetingId={id}
              attendees={attendeesList}
              guests={guestsList}
              canManage={canManageMeeting && meeting.is_in_progress}
            />
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Meeting Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {meeting.subcommittee && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Subcommittee</p>
                  <p className="text-sm text-slate-800">{meeting.subcommittee.name}</p>
                </div>
              )}
              {meeting.agenda_deadline && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Agenda submission deadline</p>
                  <p className="text-sm text-slate-800">{formatDateTime(meeting.agenda_deadline)}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 mb-1">Attendees</p>
                {hasNewAttendance ? (
                  attendeesList.length > 0 ? (
                    <ul className="text-sm text-slate-800 space-y-0.5">
                      {attendeesList.map((a) => (
                        <li key={a.id}>
                          {attendeeName(a)}
                          {a.attendance_requirement === 'optional' && <span className="text-slate-400 text-xs"> (optional)</span>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-slate-400">None recorded</p>
                ) : legacyAttendeeNames?.length ? (
                  <ul className="text-sm text-slate-800 space-y-0.5">
                    {legacyAttendeeNames.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                ) : <p className="text-sm text-slate-400">None recorded</p>}
              </div>
              {guestsList.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Guests</p>
                  <ul className="text-sm text-slate-800 space-y-0.5">
                    {guestsList.map((g) => (
                      <li key={g.id}>{g.name}{g.affiliation && <span className="text-slate-400"> — {g.affiliation}</span>}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {(isAdminEquivalent(profile?.role) || activeDelegation?.delegated_to_user_id === profile?.id) && (
            <MeetingDelegationControl
              meetingId={id}
              boardTierProfiles={boardTierProfiles}
              activeDelegation={activeDelegation}
              canGrant={isAdminEquivalent(profile?.role)}
              currentProfileId={profile?.id ?? ''}
            />
          )}
        </div>
      </div>
    </div>
  )
}

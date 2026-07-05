import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  sendAgendaDeadlineReminder, sendUpcomingMeetingReminder, sendDelegationExpiringReminder,
  AGENDA_REMINDER_DAYS_BEFORE, MEETING_REMINDER_DAYS_BEFORE, DELEGATION_REMINDER_DAYS_BEFORE,
} from '@/lib/email/reminders'

// Daily Vercel Cron job (see vercel.json). No exact-time scheduling, no queue —
// scans for meetings whose deadline/date falls within the reminder window and
// sends once per meeting (dedup via audit_logs inside the reminder functions).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()

  const agendaWindowEnd = new Date(now.getTime() + AGENDA_REMINDER_DAYS_BEFORE * 24 * 60 * 60 * 1000)
  const { data: agendaMeetings } = await supabase
    .from('meetings')
    .select('id, title, agenda_deadline')
    .eq('status', 'agenda_open')
    .not('agenda_deadline', 'is', null)
    .lte('agenda_deadline', agendaWindowEnd.toISOString())
    .gte('agenda_deadline', now.toISOString())

  let agendaRemindersSent = 0
  for (const meeting of agendaMeetings ?? []) {
    await sendAgendaDeadlineReminder(meeting as { id: string; title: string; agenda_deadline: string })
    agendaRemindersSent++
  }

  const meetingWindowEnd = new Date(now.getTime() + MEETING_REMINDER_DAYS_BEFORE * 24 * 60 * 60 * 1000)
  const { data: upcomingMeetings } = await supabase
    .from('meetings')
    .select('id, title, meeting_date')
    .eq('status', 'scheduled')
    .lte('meeting_date', meetingWindowEnd.toISOString())
    .gte('meeting_date', now.toISOString())

  let upcomingRemindersSent = 0
  for (const meeting of upcomingMeetings ?? []) {
    await sendUpcomingMeetingReminder(meeting)
    upcomingRemindersSent++
  }

  const delegationWindowEnd = new Date(now.getTime() + DELEGATION_REMINDER_DAYS_BEFORE * 24 * 60 * 60 * 1000)
  const { data: expiringDelegations } = await supabase
    .from('meeting_delegations')
    .select(`
      id, expires_at,
      meeting:meetings!meeting_id(id, title),
      delegated_to:profiles!delegated_to_user_id(email),
      granted_by:profiles!granted_by_user_id(email)
    `)
    .is('reminder_sent_at', null)
    .lte('expires_at', delegationWindowEnd.toISOString())
    .gte('expires_at', now.toISOString())

  let delegationRemindersSent = 0
  for (const d of expiringDelegations ?? []) {
    const meeting = d.meeting as unknown as { id: string; title: string } | null
    if (!meeting) continue
    await sendDelegationExpiringReminder({
      id: d.id,
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      expiresAt: d.expires_at,
      delegatedToEmail: (d.delegated_to as unknown as { email: string } | null)?.email ?? null,
      grantedByEmail: (d.granted_by as unknown as { email: string } | null)?.email ?? null,
    })
    delegationRemindersSent++
  }

  return NextResponse.json({
    checked: {
      agendaMeetings: agendaMeetings?.length ?? 0,
      upcomingMeetings: upcomingMeetings?.length ?? 0,
      expiringDelegations: expiringDelegations?.length ?? 0,
    },
    attempted: { agendaRemindersSent, upcomingRemindersSent, delegationRemindersSent },
  })
}

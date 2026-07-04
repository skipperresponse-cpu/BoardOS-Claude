import { createServiceClient } from '@/lib/supabase/server'
import { getResendClient, EMAIL_FROM } from './resend'

// Configurable, not hardcoded — matches the AI_CONFIG env-var-with-default pattern.
export const AGENDA_REMINDER_DAYS_BEFORE = Number(process.env.AGENDA_REMINDER_DAYS_BEFORE ?? 3)
export const MEETING_REMINDER_DAYS_BEFORE = Number(process.env.MEETING_REMINDER_DAYS_BEFORE ?? 3)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

// Everyone who can submit agenda items (per canSubmitAgendaItems in lib/roles.ts).
const AGENDA_SUBMITTER_ROLES = ['president', 'secretary', 'treasurer', 'board_member', 'administrator', 'advisor']
// Board-level roles only (per canVoteApprovals / the resolutions eligible-voter set).
const BOARD_TIER_ROLES = ['president', 'secretary', 'treasurer', 'board_member']

type ReminderType =
  | 'agenda_open'
  | 'agenda_deadline_approaching'
  | 'upcoming_meeting'
  | 'resolution_circulated'

/** Has this exact reminder already been sent for this resource? Simple existence check — no date-scoping needed since the underlying deadline/meeting_date doesn't change once set. */
async function hasReminderBeenSent(resourceId: string, reminderType: ReminderType): Promise<boolean> {
  const supabase = await createServiceClient()
  const { count } = await supabase
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('resource_id', resourceId)
    .eq('action', 'reminder_sent')
    .eq('metadata->>reminder_type', reminderType)
  return (count ?? 0) > 0
}

async function markReminderSent(resourceId: string, resourceType: string, reminderType: ReminderType) {
  const supabase = await createServiceClient()
  await supabase.from('audit_logs').insert({
    user_id: null,
    action: 'reminder_sent',
    resource_type: resourceType,
    resource_id: resourceId,
    metadata: { reminder_type: reminderType },
  })
}

async function getRecipientEmails(roles: string[]): Promise<string[]> {
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('email').in('role', roles)
  return (data ?? []).map((p) => p.email).filter(Boolean)
}

/** Sends one email, BCC'ing every recipient so board members don't see each other's addresses. Fails soft — a broken email send should never break the caller's main action. */
async function sendEmail(to: string[], subject: string, html: string) {
  if (to.length === 0) return
  const client = getResendClient()
  if (!client) {
    console.warn('[email] RESEND_API_KEY not set — skipping send')
    return
  }
  try {
    await client.emails.send({
      from: EMAIL_FROM,
      to: EMAIL_FROM.match(/<(.+)>/)?.[1] ?? to[0],
      bcc: to,
      subject,
      html,
    })
  } catch (err) {
    console.error(`[email] send failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function emailShell(title: string, bodyHtml: string, ctaHref?: string, ctaLabel?: string): string {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1e293b;">
      <h2 style="margin: 0 0 16px;">${title}</h2>
      ${bodyHtml}
      ${ctaHref ? `<p style="margin-top: 24px;"><a href="${APP_URL}${ctaHref}" style="background:#1e293b;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">${ctaLabel}</a></p>` : ''}
      <p style="margin-top: 32px; font-size: 12px; color: #94a3b8;">BoardOS — NRCS Governance Portal</p>
    </div>
  `
}

/** Meeting has just opened for agenda submissions. Event-triggered (called from the meeting transition), not cron. */
export async function sendAgendaOpenReminder(meeting: { id: string; title: string; agenda_deadline: string | null }) {
  if (await hasReminderBeenSent(meeting.id, 'agenda_open')) return
  const emails = await getRecipientEmails(AGENDA_SUBMITTER_ROLES)
  const deadlineText = meeting.agenda_deadline
    ? `Submissions close ${new Date(meeting.agenda_deadline).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })}.`
    : 'No submission deadline has been set yet.'
  await sendEmail(
    emails,
    `Agenda open for ${meeting.title}`,
    emailShell(
      'Agenda submissions are open',
      `<p>The agenda for <strong>${meeting.title}</strong> is now open for submissions. ${deadlineText}</p>`,
      `/meetings/${meeting.id}`,
      'Submit an agenda item'
    )
  )
  await markReminderSent(meeting.id, 'meeting', 'agenda_open')
}

/** Called by the daily cron scan for agenda_open meetings within N days of their deadline. */
export async function sendAgendaDeadlineReminder(meeting: { id: string; title: string; agenda_deadline: string }) {
  if (await hasReminderBeenSent(meeting.id, 'agenda_deadline_approaching')) return
  const emails = await getRecipientEmails(AGENDA_SUBMITTER_ROLES)
  await sendEmail(
    emails,
    `Agenda deadline approaching: ${meeting.title}`,
    emailShell(
      'Agenda submission deadline approaching',
      `<p>Submissions for <strong>${meeting.title}</strong> close ${new Date(meeting.agenda_deadline).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })}.</p>`,
      `/meetings/${meeting.id}`,
      'Submit an agenda item'
    )
  )
  await markReminderSent(meeting.id, 'meeting', 'agenda_deadline_approaching')
}

/** Called by the daily cron scan for scheduled meetings within N days of their date. */
export async function sendUpcomingMeetingReminder(meeting: { id: string; title: string; meeting_date: string }) {
  if (await hasReminderBeenSent(meeting.id, 'upcoming_meeting')) return
  const emails = await getRecipientEmails(BOARD_TIER_ROLES)
  await sendEmail(
    emails,
    `Upcoming meeting: ${meeting.title}`,
    emailShell(
      'Upcoming board meeting',
      `<p><strong>${meeting.title}</strong> is scheduled for ${new Date(meeting.meeting_date).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })}.</p>`,
      `/meetings/${meeting.id}`,
      'View meeting'
    )
  )
  await markReminderSent(meeting.id, 'meeting', 'upcoming_meeting')
}

/** Resolution circulated for signature. Event-triggered (called from the circulate route). */
export async function sendResolutionCirculatedNotice(resolution: { id: string; title: string }) {
  if (await hasReminderBeenSent(resolution.id, 'resolution_circulated')) return
  const emails = await getRecipientEmails(BOARD_TIER_ROLES)
  await sendEmail(
    emails,
    `Resolution awaiting your signature: ${resolution.title}`,
    emailShell(
      'Resolution circulated for signature',
      `<p><strong>${resolution.title}</strong> has been circulated and is awaiting your vote.</p>`,
      `/resolutions/${resolution.id}`,
      'Review and sign'
    )
  )
  await markReminderSent(resolution.id, 'resolution', 'resolution_circulated')
}

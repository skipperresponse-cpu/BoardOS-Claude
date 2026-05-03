import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { MeetingDetailClient } from './meeting-detail-client'

interface Props {
  params: Promise<{ id: string }>
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  draft_minutes: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
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
    .select('*, creator:profiles!created_by(full_name)')
    .eq('id', id)
    .single()

  if (!meeting) notFound()

  const { data: actionItems } = await supabase
    .from('action_items')
    .select('*, owner:profiles!owner_user_id(full_name)')
    .eq('meeting_id', id)
    .order('created_at')

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .order('full_name')

  return (
    <div>
      <Header
        title={meeting.title}
        description={formatDate(meeting.meeting_date)}
        action={<Badge className={STATUS_COLORS[meeting.status] ?? ''}>{meeting.status.replace('_', ' ')}</Badge>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <MeetingDetailClient
            meeting={meeting}
            actionItems={actionItems ?? []}
            profiles={profiles ?? []}
            userRole={profile?.role ?? 'viewer'}
            currentProfileId={profile?.id ?? ''}
          />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Meeting Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">Attendees</p>
                {(meeting.attendees_json as string[])?.length ? (
                  <ul className="text-sm text-slate-800 space-y-0.5">
                    {(meeting.attendees_json as string[]).map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                ) : <p className="text-sm text-slate-400">None recorded</p>}
              </div>
              {(meeting.absentees_json as string[])?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Absentees</p>
                  <ul className="text-sm text-slate-800 space-y-0.5">
                    {(meeting.absentees_json as string[]).map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}
              {(meeting.agenda_json as Array<{ id: string; title: string }>)?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Agenda</p>
                  <ol className="text-sm text-slate-800 space-y-1 list-decimal list-inside">
                    {(meeting.agenda_json as Array<{ id: string; title: string }>).map((item) => (
                      <li key={item.id}>{item.title}</li>
                    ))}
                  </ol>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

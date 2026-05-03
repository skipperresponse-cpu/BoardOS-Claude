import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate, isOverdue, ACTION_STATUS_COLORS, APPROVAL_STATUS_COLORS } from '@/lib/utils'
import { FileText, CalendarDays, CheckSquare, Vote, MessageSquare, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name')
    .eq('user_id', user!.id)
    .single()

  const [
    { data: recentDocs },
    { data: upcomingMeetings },
    { data: overdueItems },
    { data: openApprovals },
    { data: recentQueries },
    { data: myPendingVotes },
  ] = await Promise.all([
    supabase
      .from('documents')
      .select('id, title, category, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('meetings')
      .select('id, title, meeting_date, status')
      .gte('meeting_date', new Date().toISOString())
      .order('meeting_date')
      .limit(5),
    supabase
      .from('action_items')
      .select('id, title, due_date, status, owner_user_id')
      .in('status', ['Not Started', 'In Progress', 'Blocked'])
      .lt('due_date', new Date().toISOString())
      .order('due_date')
      .limit(5),
    supabase
      .from('approval_items')
      .select('id, title, status, voting_deadline')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('ai_queries')
      .select('id, question, confidence, created_at')
      .eq('user_id', profile?.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('approval_items')
      .select('id, title')
      .eq('status', 'open')
      .not('id', 'in',
        `(select approval_item_id from approval_votes where voter_user_id = '${profile?.id}')`
      )
      .limit(10),
  ])

  return (
    <div>
      <Header
        title={`Welcome, ${profile?.full_name?.split(' ')[0] ?? 'Board Member'}`}
        description="Here's your governance overview for today."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Recent Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-500" />
              Recent Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentDocs?.length ? (
              <ul className="divide-y divide-slate-100">
                {recentDocs.map((doc) => (
                  <li key={doc.id}>
                    <Link href={`/documents/${doc.id}`} className="flex flex-col gap-0.5 px-6 py-3 hover:bg-slate-50 transition-colors">
                      <span className="text-sm font-medium text-slate-800 line-clamp-1">{doc.title}</span>
                      <span className="text-xs text-slate-400">{doc.category} · {formatDate(doc.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 py-4 text-sm text-slate-400">No documents uploaded yet.</p>
            )}
            <div className="px-6 py-3 border-t border-slate-100">
              <Link href="/documents" className="text-xs font-medium text-slate-600 hover:text-slate-900">
                View all documents →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Meetings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-slate-500" />
              Upcoming Meetings
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {upcomingMeetings?.length ? (
              <ul className="divide-y divide-slate-100">
                {upcomingMeetings.map((m) => (
                  <li key={m.id}>
                    <Link href={`/meetings/${m.id}`} className="flex flex-col gap-0.5 px-6 py-3 hover:bg-slate-50 transition-colors">
                      <span className="text-sm font-medium text-slate-800 line-clamp-1">{m.title}</span>
                      <span className="text-xs text-slate-400">{formatDate(m.meeting_date)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 py-4 text-sm text-slate-400">No upcoming meetings.</p>
            )}
            <div className="px-6 py-3 border-t border-slate-100">
              <Link href="/meetings" className="text-xs font-medium text-slate-600 hover:text-slate-900">
                View all meetings →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Overdue Action Items */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Overdue Action Items
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {overdueItems?.length ? (
              <ul className="divide-y divide-slate-100">
                {overdueItems.map((item) => (
                  <li key={item.id}>
                    <Link href={`/action-items`} className="flex items-center justify-between gap-2 px-6 py-3 hover:bg-slate-50 transition-colors">
                      <span className="text-sm text-slate-800 line-clamp-1 flex-1">{item.title}</span>
                      <span className="text-xs text-red-600 font-medium whitespace-nowrap">{formatDate(item.due_date)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 py-4 text-sm text-slate-400">No overdue items.</p>
            )}
            <div className="px-6 py-3 border-t border-slate-100">
              <Link href="/action-items" className="text-xs font-medium text-slate-600 hover:text-slate-900">
                View all action items →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Open Approvals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Vote className="h-4 w-4 text-slate-500" />
              Open Approvals
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {openApprovals?.length ? (
              <ul className="divide-y divide-slate-100">
                {openApprovals.map((a) => (
                  <li key={a.id}>
                    <Link href={`/approvals/${a.id}`} className="flex flex-col gap-0.5 px-6 py-3 hover:bg-slate-50 transition-colors">
                      <span className="text-sm font-medium text-slate-800 line-clamp-1">{a.title}</span>
                      {a.voting_deadline && (
                        <span className="text-xs text-slate-400">Deadline: {formatDate(a.voting_deadline)}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 py-4 text-sm text-slate-400">No open approvals.</p>
            )}
            <div className="px-6 py-3 border-t border-slate-100">
              <Link href="/approvals" className="text-xs font-medium text-slate-600 hover:text-slate-900">
                View all approvals →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* My Pending Votes */}
        {profile?.role !== 'viewer' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-slate-500" />
                My Pending Votes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {myPendingVotes?.length ? (
                <ul className="divide-y divide-slate-100">
                  {myPendingVotes.map((a) => (
                    <li key={a.id}>
                      <Link href={`/approvals/${a.id}`} className="flex items-center gap-2 px-6 py-3 hover:bg-slate-50 transition-colors">
                        <span className="text-sm text-slate-800 line-clamp-1 flex-1">{a.title}</span>
                        <Badge className="bg-amber-100 text-amber-700">Vote needed</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-6 py-4 text-sm text-slate-400">No pending votes.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recent AI Questions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-slate-500" />
              Recent AI Questions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentQueries?.length ? (
              <ul className="divide-y divide-slate-100">
                {recentQueries.map((q) => (
                  <li key={q.id} className="px-6 py-3">
                    <p className="text-sm text-slate-800 line-clamp-1">{q.question}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(q.created_at)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 py-4 text-sm text-slate-400">No recent questions.</p>
            )}
            <div className="px-6 py-3 border-t border-slate-100">
              <Link href="/ask" className="text-xs font-medium text-slate-600 hover:text-slate-900">
                Ask a question →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

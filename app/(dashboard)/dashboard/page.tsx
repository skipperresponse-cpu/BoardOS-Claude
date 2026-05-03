import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  CalendarDays, CheckSquare, Vote, MessageSquare,
  AlertCircle, TrendingUp, Users, Clock, ArrowRight,
  CheckCircle2, CircleDot, XCircle, MinusCircle, Sparkles, BarChart3,
} from 'lucide-react'
import { format } from 'date-fns'

// ─── SVG donut chart ──────────────────────────────────────────────────────────

function DonutChart({ done, inProgress, notStarted, blocked }: {
  done: number; inProgress: number; notStarted: number; blocked: number
}) {
  const total = done + inProgress + notStarted + blocked || 1
  const completionRate = Math.round((done / total) * 100)
  const r = 36
  const circumference = 2 * Math.PI * r
  const segments = [
    { value: done, color: '#10b981' },
    { value: inProgress, color: '#f59e0b' },
    { value: notStarted, color: '#94a3b8' },
    { value: blocked, color: '#ef4444' },
  ]
  let cumulativePct = 0
  return (
    <svg viewBox="0 0 100 100" className="w-32 h-32">
      {segments.map((seg, i) => {
        const pct = seg.value / total
        const dashLen = pct * circumference
        const angle = cumulativePct * 360 - 90
        cumulativePct += pct
        return (
          <circle key={i} cx="50" cy="50" r={r} fill="none"
            stroke={pct > 0 ? seg.color : 'transparent'}
            strokeWidth="16"
            strokeDasharray={`${dashLen} ${circumference - dashLen}`}
            transform={`rotate(${angle} 50 50)`}
          />
        )
      })}
      <text x="50" y="47" textAnchor="middle" fill="#0f172a" fontSize="18" fontWeight="800">{completionRate}%</text>
      <text x="50" y="60" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="500">complete</text>
    </svg>
  )
}

function AttendanceBar({ pct, color = '#6366f1' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function statusIcon(status: string) {
  switch (status) {
    case 'Done': return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
    case 'In Progress': return <CircleDot className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
    case 'Blocked': return <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
    default: return <MinusCircle className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
  }
}

function confidenceBadge(conf: string) {
  if (conf === 'high') return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">High</span>
  if (conf === 'medium') return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Medium</span>
  return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">Low</span>
}

function daysUntil(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return <span className="text-red-600 font-semibold text-xs">{Math.abs(diff)}d overdue</span>
  if (diff === 0) return <span className="text-amber-600 font-semibold text-xs">Today</span>
  if (diff <= 3) return <span className="text-amber-600 font-semibold text-xs">in {diff}d</span>
  return <span className="text-slate-400 text-xs">in {diff}d</span>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles').select('id, role, full_name').eq('user_id', user!.id).single()

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Board Member'
  const today = format(new Date(), 'EEEE, d MMMM yyyy')

  const now = new Date().toISOString()
  const yearStart = `${new Date().getFullYear()}-01-01`

  const [
    { data: upcomingMeetings },
    { data: allActionItems },
    { data: openApprovals },
    { data: allApprovalVotes },
    { data: recentQueries },
    { data: boardMembers },
    { data: pastMeetings },
  ] = await Promise.all([
    supabase.from('meetings').select('id, title, meeting_date, attendees_json').gte('meeting_date', now).order('meeting_date').limit(5),
    supabase.from('action_items').select('id, title, status, due_date, owner_user_id, profiles!owner_user_id(full_name)').order('due_date'),
    supabase.from('approval_items').select('id, title, status, voting_deadline').eq('status', 'open').order('created_at', { ascending: false }),
    supabase.from('approval_votes').select('approval_item_id, voter_user_id, vote'),
    supabase.from('ai_queries').select('id, question, confidence, created_at').eq('user_id', profile?.id ?? '').order('created_at', { ascending: false }).limit(3),
    supabase.from('profiles').select('id').neq('role', 'viewer'),
    supabase.from('meetings').select('id, title, meeting_date, attendees_json').gte('meeting_date', yearStart).lt('meeting_date', now).order('meeting_date', { ascending: false }).limit(12),
  ])

  // ── Compute stats ──────────────────────────────────────────────────────────
  const totalBoardMembers = boardMembers?.length ?? 6

  const actionStats = (allActionItems ?? []).reduce(
    (acc, a) => { acc[a.status as keyof typeof acc] = (acc[a.status as keyof typeof acc] ?? 0) + 1; return acc },
    { Done: 0, 'In Progress': 0, 'Not Started': 0, Blocked: 0 }
  )
  const totalActions = Object.values(actionStats).reduce((a, b) => a + b, 0)
  const completionRate = totalActions > 0 ? Math.round((actionStats.Done / totalActions) * 100) : 0

  const overdueItems = (allActionItems ?? []).filter(
    a => a.status !== 'Done' && a.due_date && new Date(a.due_date) < new Date()
  )

  // Pending votes for current user
  const myVotedIds = new Set(
    (allApprovalVotes ?? []).filter(v => v.voter_user_id === profile?.id).map(v => v.approval_item_id)
  )
  const pendingVotes = (openApprovals ?? []).filter(a => !myVotedIds.has(a.id))

  // Attendance: avg across past meetings
  const avgAttendance = pastMeetings?.length
    ? Math.round(pastMeetings.reduce((sum, m) => {
        const count = Array.isArray(m.attendees_json) ? m.attendees_json.length : 0
        return sum + (totalBoardMembers > 0 ? (count / totalBoardMembers) * 100 : 0)
      }, 0) / pastMeetings.length)
    : 0

  // Monthly attendance for chart (last 12 months or YTD)
  const monthlyAttendance = (() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const currentMonth = new Date().getMonth()
    return months.map((label, idx) => {
      if (idx > currentMonth) return { label, pct: 0, future: true }
      const meetingsInMonth = (pastMeetings ?? []).filter(m => new Date(m.meeting_date).getMonth() === idx)
      if (meetingsInMonth.length === 0) return { label, pct: 0, future: false, noMeeting: true }
      const avg = meetingsInMonth.reduce((sum, m) => {
        const cnt = Array.isArray(m.attendees_json) ? m.attendees_json.length : 0
        return sum + (totalBoardMembers > 0 ? (cnt / totalBoardMembers) * 100 : 0)
      }, 0) / meetingsInMonth.length
      return { label, pct: Math.round(avg), future: false }
    })
  })()

  // Vote breakdown per approval
  const voteBreakdown = (openApprovals ?? []).map(a => {
    const votes = (allApprovalVotes ?? []).filter(v => v.approval_item_id === a.id)
    const approve = votes.filter(v => v.vote === 'Approve').length
    const disapprove = votes.filter(v => v.vote === 'Disapprove').length
    const abstain = votes.filter(v => v.vote === 'Abstain' || v.vote === 'Request Clarification').length
    const pending = totalBoardMembers - votes.length
    return { ...a, approve, disapprove, abstain, pending, total: totalBoardMembers }
  })

  // Owner name helper — Supabase returns joined profiles as array or single object
  const ownerName = (item: { profiles?: { full_name: string } | { full_name: string }[] | null }) => {
    const p = item.profiles
    if (!p) return '—'
    return Array.isArray(p) ? (p[0]?.full_name ?? '—') : p.full_name
  }

  return (
    <div className="space-y-6">

      {/* Welcome banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-800 to-slate-700 p-5 sm:p-6 text-white flex items-center justify-between">
        <div>
          <p className="text-slate-400 text-xs sm:text-sm font-medium">{today}</p>
          <h2 className="text-xl sm:text-2xl font-bold mt-1">Good day, {firstName} 👋</h2>
          <p className="text-slate-300 text-sm mt-1">
            {pendingVotes.length > 0
              ? <><span className="text-white font-semibold">{pendingVotes.length} pending vote{pendingVotes.length !== 1 ? 's' : ''}</span> · </>
              : null}
            <span className="text-white font-semibold">{overdueItems.length} overdue action item{overdueItems.length !== 1 ? 's' : ''}</span>
            {' '}· <span className="text-white font-semibold">{upcomingMeetings?.length ?? 0} upcoming meeting{(upcomingMeetings?.length ?? 0) !== 1 ? 's' : ''}</span>
          </p>
        </div>
        <div className="hidden md:flex items-center gap-6 text-center">
          <div>
            <p className="text-2xl font-bold">{pastMeetings?.length ?? 0}</p>
            <p className="text-slate-400 text-xs mt-0.5">Meetings</p>
            <p className="text-slate-400 text-xs">This Year</p>
          </div>
          <div className="w-px h-10 bg-slate-600" />
          <div>
            <p className="text-2xl font-bold">{openApprovals?.length ?? 0}</p>
            <p className="text-slate-400 text-xs mt-0.5">Open</p>
            <p className="text-slate-400 text-xs">Approvals</p>
          </div>
          <div className="w-px h-10 bg-slate-600" />
          <div>
            <p className="text-2xl font-bold">{totalBoardMembers}</p>
            <p className="text-slate-400 text-xs mt-0.5">Board</p>
            <p className="text-slate-400 text-xs">Members</p>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Meetings YTD</span>
            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <CalendarDays className="h-4 w-4 text-blue-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">{pastMeetings?.length ?? 0}</p>
          <p className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> {upcomingMeetings?.length ?? 0} upcoming
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions Done</span>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <CheckSquare className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">{completionRate}%</p>
          <div className="mt-2"><AttendanceBar pct={completionRate} color="#10b981" /></div>
          <p className="text-xs text-slate-400 mt-1">{actionStats.Done} of {totalActions} items complete</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Open Approvals</span>
            <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center">
              <Vote className="h-4 w-4 text-violet-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">{openApprovals?.length ?? 0}</p>
          {pendingVotes.length > 0 ? (
            <p className="text-xs text-amber-600 font-medium mt-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {pendingVotes.length} need your vote
            </p>
          ) : (
            <p className="text-xs text-emerald-600 font-medium mt-1">All votes cast ✓</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg. Attendance</span>
            <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Users className="h-4 w-4 text-amber-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">{avgAttendance > 0 ? `${avgAttendance}%` : '—'}</p>
          {avgAttendance > 0 && <div className="mt-2"><AttendanceBar pct={avgAttendance} color="#f59e0b" /></div>}
          <p className="text-xs text-slate-400 mt-1">{pastMeetings?.length ?? 0} meetings this year</p>
        </div>
      </div>

      {/* Pending votes alert */}
      {pendingVotes.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Vote className="h-4 w-4 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">You have {pendingVotes.length} outstanding vote{pendingVotes.length !== 1 ? 's' : ''}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {pendingVotes.map(v => (
                <Link key={v.id} href={`/approvals/${v.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium bg-white border border-amber-200 text-amber-800 px-3 py-1.5 rounded-full hover:bg-amber-50 transition-colors">
                  {v.title} <ArrowRight className="h-3 w-3" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Action items status */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Action Items Status</h3>
            <Link href="/action-items" className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {totalActions > 0 ? (
            <div className="flex items-center gap-4">
              <DonutChart done={actionStats.Done} inProgress={actionStats['In Progress']} notStarted={actionStats['Not Started']} blocked={actionStats.Blocked} />
              <div className="flex-1 space-y-2.5">
                {[
                  { label: 'Done', count: actionStats.Done, color: 'bg-emerald-500', text: 'text-emerald-700' },
                  { label: 'In Progress', count: actionStats['In Progress'], color: 'bg-amber-500', text: 'text-amber-700' },
                  { label: 'Not Started', count: actionStats['Not Started'], color: 'bg-slate-300', text: 'text-slate-600' },
                  { label: 'Blocked', count: actionStats.Blocked, color: 'bg-red-500', text: 'text-red-700' },
                ].map(({ label, count, color, text }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
                      <span className="text-xs text-slate-600">{label}</span>
                    </div>
                    <span className={`text-xs font-bold ${text}`}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-4 text-center">No action items yet.</p>
          )}

          {overdueItems.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {overdueItems.length} overdue
              </p>
              <div className="space-y-1.5">
                {overdueItems.slice(0, 3).map(item => (
                  <div key={item.id} className="flex items-start gap-2">
                    {statusIcon(item.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-700 line-clamp-1">{item.title}</p>
                      <p className="text-[10px] text-slate-400">{ownerName(item)} · {daysUntil(item.due_date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Upcoming meetings */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Upcoming Meetings</h3>
            <Link href="/meetings" className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {upcomingMeetings?.length ? (
            <div className="space-y-3">
              {upcomingMeetings.slice(0, 4).map((m, idx) => {
                const date = new Date(m.meeting_date)
                const dayNum = format(date, 'd')
                const month = format(date, 'MMM').toUpperCase()
                const time = format(date, 'h:mm a')
                const attendeeCount = Array.isArray(m.attendees_json) ? m.attendees_json.length : 0
                const isFirst = idx === 0
                return (
                  <Link key={m.id} href={`/meetings/${m.id}`}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors hover:bg-slate-50 ${isFirst ? 'bg-blue-50 border border-blue-100' : ''}`}>
                    <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex flex-col items-center justify-center ${isFirst ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                      <span className="text-[10px] font-semibold leading-none">{month}</span>
                      <span className="text-base font-bold leading-tight">{dayNum}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium line-clamp-1 ${isFirst ? 'text-blue-900' : 'text-slate-800'}`}>{m.title}</p>
                      <p className={`text-xs mt-0.5 flex items-center gap-1 ${isFirst ? 'text-blue-600' : 'text-slate-400'}`}>
                        <Clock className="h-3 w-3" /> {time} {attendeeCount > 0 ? `· ${attendeeCount} members` : ''}
                      </p>
                    </div>
                    {isFirst && <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700 flex-shrink-0">Next</span>}
                  </Link>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-4 text-center">No upcoming meetings scheduled.</p>
          )}
        </div>

        {/* Approval voting */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Approval Voting</h3>
            <Link href="/approvals" className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {voteBreakdown.length ? (
            <div className="space-y-5">
              {voteBreakdown.slice(0, 3).map(a => {
                const approved = a.total > 0 ? Math.round((a.approve / a.total) * 100) : 0
                const circumference = a.total
                return (
                  <Link key={a.id} href={`/approvals/${a.id}`} className="block group">
                    <div className="flex items-start justify-between mb-1.5">
                      <p className="text-sm font-medium text-slate-800 line-clamp-1 group-hover:text-violet-700 transition-colors flex-1 pr-2">{a.title}</p>
                      <span className="text-xs font-bold text-emerald-700 flex-shrink-0">{approved}%</span>
                    </div>
                    <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
                      {a.approve > 0 && <div className="bg-emerald-500" style={{ width: `${(a.approve / circumference) * 100}%` }} />}
                      {a.disapprove > 0 && <div className="bg-red-500" style={{ width: `${(a.disapprove / circumference) * 100}%` }} />}
                      {a.abstain > 0 && <div className="bg-slate-300" style={{ width: `${(a.abstain / circumference) * 100}%` }} />}
                      {a.pending > 0 && <div className="bg-slate-100" style={{ width: `${(a.pending / circumference) * 100}%` }} />}
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-3 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />{a.approve} approve</span>
                        {a.disapprove > 0 && <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />{a.disapprove}</span>}
                        {a.pending > 0 && <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300" />{a.pending} pending</span>}
                      </div>
                      {a.voting_deadline && (
                        <span className="text-[10px] text-slate-400">{format(new Date(a.voting_deadline), 'd MMM')}</span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-4 text-center">No open approvals.</p>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Attendance chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Meeting Attendance — {new Date().getFullYear()}</h3>
              <p className="text-xs text-slate-400 mt-0.5">% of board members present per month</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-blue-600" />
            </div>
          </div>
          <div className="flex items-end gap-1.5 h-28">
            {monthlyAttendance.map(bar => (
              <div key={bar.label} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center" style={{ height: '80px' }}>
                  {!bar.future && !('noMeeting' in bar && bar.noMeeting) ? (
                    <div className="w-full rounded-t-md transition-all" style={{
                      height: `${Math.max(bar.pct * 0.8, 4)}px`,
                      background: bar.pct >= 90 ? '#10b981' : bar.pct >= 75 ? '#f59e0b' : bar.pct > 0 ? '#ef4444' : '#e2e8f0',
                    }} />
                  ) : (
                    <div className="w-full rounded-t-md bg-slate-100" style={{ height: '4px' }} />
                  )}
                </div>
                <span className="text-[9px] text-slate-400 font-medium">{bar.label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /><span className="text-xs text-slate-500">≥90%</span></div>
            <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-sm bg-amber-500" /><span className="text-xs text-slate-500">75–89%</span></div>
            <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-sm bg-red-500" /><span className="text-xs text-slate-500">&lt;75%</span></div>
            <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-sm bg-slate-100 border border-slate-200" /><span className="text-xs text-slate-500">No meeting / Scheduled</span></div>
          </div>
        </div>

        {/* Recent AI queries */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Recent AI Queries</h3>
            <Link href="/ask" className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1">
              Ask AI <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {recentQueries?.length ? (
            <div className="space-y-3">
              {recentQueries.map(q => (
                <div key={q.id} className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50">
                  <div className="h-6 w-6 rounded-md bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="h-3 w-3 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-700 line-clamp-2">{q.question}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {confidenceBadge(q.confidence)}
                      <span className="text-[10px] text-slate-400">{format(new Date(q.created_at), 'd MMM')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-2 text-center">No queries yet.</p>
          )}
          <Link href="/ask"
            className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors">
            <Sparkles className="h-3.5 w-3.5" /> Ask a governance question
          </Link>
        </div>
      </div>
    </div>
  )
}

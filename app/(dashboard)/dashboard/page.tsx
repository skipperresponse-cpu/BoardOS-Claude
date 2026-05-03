import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import {
  CalendarDays, CheckSquare, Vote, MessageSquare,
  AlertCircle, TrendingUp, Users, Clock, ArrowRight,
  CheckCircle2, CircleDot, XCircle, MinusCircle, Sparkles,
  BarChart3,
} from 'lucide-react'
import { format, formatDistanceToNow, isPast } from 'date-fns'

// ─── Mock data (shown when DB is empty) ─────────────────────────────────────

const MOCK_MEETINGS = [
  { id: 'm1', title: 'Q2 Board Meeting', meeting_date: '2026-05-15T09:00:00Z', attendees: 7 },
  { id: 'm2', title: 'Finance Committee Review', meeting_date: '2026-05-22T14:00:00Z', attendees: 5 },
  { id: 'm3', title: 'AGM 2026 Planning', meeting_date: '2026-06-03T10:00:00Z', attendees: 8 },
  { id: 'm4', title: 'HR Policy Workshop', meeting_date: '2026-06-10T14:00:00Z', attendees: 6 },
]

const MOCK_ACTION_ITEMS = [
  { id: 'a1', title: 'Finalise external audit report', status: 'In Progress', due_date: '2026-04-30', owner: 'Daniel Tan' },
  { id: 'a2', title: 'Update volunteer handbook', status: 'Not Started', due_date: '2026-04-25', owner: 'Sarah Lim' },
  { id: 'a3', title: 'Submit Q1 grant report to MOH', status: 'Blocked', due_date: '2026-04-28', owner: 'Michael Lee' },
  { id: 'a4', title: 'Review board insurance coverage', status: 'In Progress', due_date: '2026-05-08', owner: 'Daniel Tan' },
  { id: 'a5', title: 'Prepare AGM notice & agenda', status: 'Not Started', due_date: '2026-05-20', owner: 'Sarah Lim' },
]

const MOCK_APPROVALS = [
  {
    id: 'ap1', title: '2026 Annual Budget Revision',
    voting_deadline: '2026-05-10T23:59:00Z',
    approve: 6, disapprove: 0, abstain: 1, pending: 1, total: 8,
  },
  {
    id: 'ap2', title: 'Volunteer Engagement Policy Update',
    voting_deadline: '2026-05-14T23:59:00Z',
    approve: 4, disapprove: 2, abstain: 0, pending: 2, total: 8,
  },
  {
    id: 'ap3', title: 'MOH Grant Application FY26/27',
    voting_deadline: '2026-05-17T23:59:00Z',
    approve: 7, disapprove: 0, abstain: 0, pending: 1, total: 8,
  },
]

const MOCK_PENDING_VOTES = [
  { id: 'ap1', title: '2026 Annual Budget Revision' },
  { id: 'ap3', title: 'MOH Grant Application FY26/27' },
]

const MOCK_AI_QUERIES = [
  { id: 'q1', question: 'What are the quorum requirements for board decisions?', confidence: 'high', created_at: '2026-05-01T10:23:00Z' },
  { id: 'q2', question: 'Summarise key points from the 2025 Annual Report', confidence: 'high', created_at: '2026-04-30T14:05:00Z' },
  { id: 'q3', question: 'What is the process for emergency spending approval?', confidence: 'medium', created_at: '2026-04-28T09:17:00Z' },
]

// Action item stats (mock)
const AI_STATS = { done: 8, inProgress: 2, notStarted: 2, blocked: 1 }
const TOTAL_AI = Object.values(AI_STATS).reduce((a, b) => a + b, 0)
const COMPLETION_RATE = Math.round((AI_STATS.done / TOTAL_AI) * 100)

// ─── Donut chart (pure SVG, server-renderable) ───────────────────────────────

function DonutChart() {
  const r = 36
  const circumference = 2 * Math.PI * r
  const segments = [
    { value: AI_STATS.done, color: '#10b981' },
    { value: AI_STATS.inProgress, color: '#f59e0b' },
    { value: AI_STATS.notStarted, color: '#94a3b8' },
    { value: AI_STATS.blocked, color: '#ef4444' },
  ]
  let cumulativePct = 0
  return (
    <svg viewBox="0 0 100 100" className="w-32 h-32">
      {segments.map((seg, i) => {
        const pct = seg.value / TOTAL_AI
        const dashLen = pct * circumference
        const angle = cumulativePct * 360 - 90
        cumulativePct += pct
        return (
          <circle
            key={i}
            cx="50" cy="50" r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth="16"
            strokeDasharray={`${dashLen} ${circumference - dashLen}`}
            transform={`rotate(${angle} 50 50)`}
          />
        )
      })}
      <text x="50" y="47" textAnchor="middle" fill="#0f172a" fontSize="18" fontWeight="800">{COMPLETION_RATE}%</text>
      <text x="50" y="60" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="500">complete</text>
    </svg>
  )
}

// ─── Mini bar spark (attendance %) ──────────────────────────────────────────

function AttendanceBar({ pct, color = '#6366f1' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

// ─── Vote bar ────────────────────────────────────────────────────────────────

function VoteBar({ approve, disapprove, abstain, pending, total }: {
  approve: number; disapprove: number; abstain: number; pending: number; total: number
}) {
  const pctApprove = (approve / total) * 100
  const pctDisapprove = (disapprove / total) * 100
  const pctAbstain = (abstain / total) * 100
  const pctPending = (pending / total) * 100
  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-px bg-slate-100">
      {pctApprove > 0 && <div className="bg-emerald-500 rounded-l-full" style={{ width: `${pctApprove}%` }} />}
      {pctDisapprove > 0 && <div className="bg-red-500" style={{ width: `${pctDisapprove}%` }} />}
      {pctAbstain > 0 && <div className="bg-slate-300" style={{ width: `${pctAbstain}%` }} />}
      {pctPending > 0 && <div className="bg-slate-200 rounded-r-full" style={{ width: `${pctPending}%` }} />}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusIcon(status: string) {
  switch (status) {
    case 'Done': return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
    case 'In Progress': return <CircleDot className="h-3.5 w-3.5 text-amber-500" />
    case 'Blocked': return <XCircle className="h-3.5 w-3.5 text-red-500" />
    default: return <MinusCircle className="h-3.5 w-3.5 text-slate-400" />
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

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name')
    .eq('user_id', user!.id)
    .single()

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Board Member'
  const today = format(new Date(), 'EEEE, d MMMM yyyy')

  // Fetch real data, fall back to mock when empty
  const [
    { data: dbMeetings },
    { data: dbOverdue },
    { data: dbApprovals },
    { data: dbQueries },
    { data: dbPending },
  ] = await Promise.all([
    supabase.from('meetings').select('id, title, meeting_date').gte('meeting_date', new Date().toISOString()).order('meeting_date').limit(4),
    supabase.from('action_items').select('id, title, status, due_date').in('status', ['Not Started', 'In Progress', 'Blocked']).lt('due_date', new Date().toISOString()).order('due_date').limit(5),
    supabase.from('approval_items').select('id, title, voting_deadline').eq('status', 'open').order('created_at', { ascending: false }).limit(3),
    supabase.from('ai_queries').select('id, question, confidence, created_at').eq('user_id', profile?.id ?? '').order('created_at', { ascending: false }).limit(3),
    supabase.from('approval_items').select('id, title').eq('status', 'open').not('id', 'in', `(select approval_item_id from approval_votes where voter_user_id = '${profile?.id}')`).limit(5),
  ])

  const meetings = dbMeetings?.length ? dbMeetings.map(m => ({ ...m, attendees: 7 })) : MOCK_MEETINGS
  const overdueItems = dbOverdue?.length ? dbOverdue.map(a => ({ ...a, owner: 'Board Member' })) : MOCK_ACTION_ITEMS.filter(a => isPast(new Date(a.due_date)))
  const approvals = MOCK_APPROVALS  // always use mock vote data for visual richness
  const aiQueries = dbQueries?.length ? dbQueries : MOCK_AI_QUERIES
  const pendingVotes = dbPending?.length ? dbPending : MOCK_PENDING_VOTES

  return (
    <div className="space-y-6">

      {/* ── Welcome banner ── */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-800 to-slate-700 p-6 text-white flex items-center justify-between">
        <div>
          <p className="text-slate-400 text-sm font-medium">{today}</p>
          <h2 className="text-2xl font-bold mt-1">Good day, {firstName} 👋</h2>
          <p className="text-slate-300 text-sm mt-1">
            You have <span className="text-white font-semibold">{pendingVotes.length} pending vote{pendingVotes.length !== 1 ? 's' : ''}</span> and <span className="text-white font-semibold">{overdueItems.length} overdue action items</span>.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-6 text-center">
          <div>
            <p className="text-2xl font-bold">{meetings.length}</p>
            <p className="text-slate-400 text-xs mt-0.5">Upcoming</p>
            <p className="text-slate-400 text-xs">Meetings</p>
          </div>
          <div className="w-px h-10 bg-slate-600" />
          <div>
            <p className="text-2xl font-bold">{approvals.length}</p>
            <p className="text-slate-400 text-xs mt-0.5">Open</p>
            <p className="text-slate-400 text-xs">Approvals</p>
          </div>
          <div className="w-px h-10 bg-slate-600" />
          <div>
            <p className="text-2xl font-bold">8</p>
            <p className="text-slate-400 text-xs mt-0.5">Active Board</p>
            <p className="text-slate-400 text-xs">Members</p>
          </div>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Meetings YTD</span>
            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <CalendarDays className="h-4 w-4 text-blue-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">12</p>
          <p className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> 3 held this quarter
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions Done</span>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <CheckSquare className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">{COMPLETION_RATE}%</p>
          <div className="mt-2">
            <AttendanceBar pct={COMPLETION_RATE} color="#10b981" />
          </div>
          <p className="text-xs text-slate-400 mt-1">{AI_STATS.done} of {TOTAL_AI} items complete</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Open Approvals</span>
            <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center">
              <Vote className="h-4 w-4 text-violet-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">{approvals.length}</p>
          <p className="text-xs text-amber-600 font-medium mt-1 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {pendingVotes.length} need your vote
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg. Attendance</span>
            <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Users className="h-4 w-4 text-amber-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">87%</p>
          <div className="mt-2">
            <AttendanceBar pct={87} color="#f59e0b" />
          </div>
          <p className="text-xs text-slate-400 mt-1">7 of 8 members per meeting</p>
        </div>
      </div>

      {/* ── Pending votes alert ── */}
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

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Action items status */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Action Items Status</h3>
            <Link href="/action-items" className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <DonutChart />
            <div className="flex-1 space-y-2.5">
              {[
                { label: 'Done', count: AI_STATS.done, color: 'bg-emerald-500', text: 'text-emerald-700' },
                { label: 'In Progress', count: AI_STATS.inProgress, color: 'bg-amber-500', text: 'text-amber-700' },
                { label: 'Not Started', count: AI_STATS.notStarted, color: 'bg-slate-300', text: 'text-slate-600' },
                { label: 'Blocked', count: AI_STATS.blocked, color: 'bg-red-500', text: 'text-red-700' },
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

          {/* Overdue items */}
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
                      <p className="text-[10px] text-slate-400">{item.owner} · {daysUntil(item.due_date)}</p>
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
          <div className="space-y-3">
            {meetings.map((m, idx) => {
              const date = new Date(m.meeting_date)
              const dayNum = format(date, 'd')
              const month = format(date, 'MMM').toUpperCase()
              const time = format(date, 'h:mm a')
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
                      <Clock className="h-3 w-3" /> {time} · {(m as typeof MOCK_MEETINGS[0]).attendees ?? 7} members
                    </p>
                  </div>
                  {isFirst && (
                    <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700 flex-shrink-0">Next</span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Approvals pipeline */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Approval Voting</h3>
            <Link href="/approvals" className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-5">
            {approvals.map(a => {
              const approved = Math.round((a.approve / a.total) * 100)
              return (
                <Link key={a.id} href={`/approvals/${a.id}`} className="block group">
                  <div className="flex items-start justify-between mb-1.5">
                    <p className="text-sm font-medium text-slate-800 line-clamp-1 group-hover:text-violet-700 transition-colors flex-1 pr-2">{a.title}</p>
                    <span className="text-xs font-bold text-emerald-700 flex-shrink-0">{approved}%</span>
                  </div>
                  <VoteBar approve={a.approve} disapprove={a.disapprove} abstain={a.abstain} pending={a.pending} total={a.total} />
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-3 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />{a.approve} approve</span>
                      {a.disapprove > 0 && <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />{a.disapprove} disapprove</span>}
                      {a.pending > 0 && <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300" />{a.pending} pending</span>}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {format(new Date(a.voting_deadline), 'd MMM')}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Bottom row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Monthly meeting attendance chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Meeting Attendance — 2026</h3>
              <p className="text-xs text-slate-400 mt-0.5">% of board members present</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-blue-600" />
            </div>
          </div>
          {/* Bar chart */}
          {(() => {
            const bars = [
              { month: 'Jan', pct: 100 },
              { month: 'Feb', pct: 88 },
              { month: 'Mar', pct: 75 },
              { month: 'Apr', pct: 100 },
              { month: 'May', pct: 0, future: true },
              { month: 'Jun', pct: 0, future: true },
              { month: 'Jul', pct: 0, future: true },
              { month: 'Aug', pct: 0, future: true },
              { month: 'Sep', pct: 0, future: true },
              { month: 'Oct', pct: 0, future: true },
              { month: 'Nov', pct: 0, future: true },
              { month: 'Dec', pct: 0, future: true },
            ]
            return (
              <div className="flex items-end gap-1.5 h-28">
                {bars.map(bar => (
                  <div key={bar.month} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end justify-center" style={{ height: '80px' }}>
                      {!bar.future ? (
                        <div
                          className="w-full rounded-t-md transition-all"
                          style={{
                            height: `${bar.pct === 0 ? 4 : bar.pct * 0.8}px`,
                            background: bar.pct >= 90 ? '#10b981' : bar.pct >= 75 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      ) : (
                        <div className="w-full rounded-t-md bg-slate-100" style={{ height: '4px' }} />
                      )}
                    </div>
                    <span className="text-[9px] text-slate-400 font-medium">{bar.month}</span>
                  </div>
                ))}
              </div>
            )
          })()}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /><span className="text-xs text-slate-500">≥90%</span></div>
            <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-sm bg-amber-500" /><span className="text-xs text-slate-500">75–89%</span></div>
            <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-sm bg-red-500" /><span className="text-xs text-slate-500">&lt;75%</span></div>
            <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-sm bg-slate-100" /><span className="text-xs text-slate-500">Scheduled</span></div>
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
          <div className="space-y-3">
            {aiQueries.map(q => (
              <div key={q.id} className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50">
                <div className="h-6 w-6 rounded-md bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles className="h-3 w-3 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 line-clamp-2">{q.question}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {confidenceBadge(q.confidence)}
                    <span className="text-[10px] text-slate-400">
                      {format(new Date(q.created_at), 'd MMM')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Link href="/ask"
            className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors">
            <Sparkles className="h-3.5 w-3.5" /> Ask a governance question
          </Link>
        </div>
      </div>
    </div>
  )
}

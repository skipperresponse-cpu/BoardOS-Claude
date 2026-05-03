'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, cn } from '@/lib/utils'
import type { Meeting, UserRole } from '@/types'
import { CalendarDays, Plus, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Props {
  meetings: Meeting[]
  userRole: UserRole
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  draft_minutes: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

export function MeetingsClient({ meetings: initialMeetings, userRole }: Props) {
  const [meetings, setMeetings] = useState(initialMeetings)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    meeting_date: '',
    attendees: '',
    absentees: '',
    agenda: '',
  })
  const router = useRouter()
  const supabase = createClient()

  const filtered = meetings.filter((m) =>
    m.title.toLowerCase().includes(search.toLowerCase())
  )

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('id').eq('user_id', user!.id).single()

    const attendees = form.attendees.split(',').map((s) => s.trim()).filter(Boolean)
    const absentees = form.absentees.split(',').map((s) => s.trim()).filter(Boolean)
    const agendaItems = form.agenda
      .split('\n')
      .map((line, i) => ({ id: String(i + 1), title: line.trim() }))
      .filter((a) => a.title)

    const { data: meeting } = await supabase
      .from('meetings')
      .insert({
        title: form.title,
        meeting_date: form.meeting_date,
        attendees_json: attendees,
        absentees_json: absentees,
        agenda_json: agendaItems,
        created_by: profile?.id,
        status: 'scheduled',
      })
      .select()
      .single()

    setSaving(false)
    if (meeting) {
      setMeetings((prev) => [meeting, ...prev])
      setShowCreate(false)
      setForm({ title: '', meeting_date: '', attendees: '', absentees: '', agenda: '' })
      router.push(`/meetings/${meeting.id}`)
    }
  }

  return (
    <div>
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search meetings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {userRole === 'admin' && (
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-4 w-4" />
            New Meeting
          </Button>
        )}
      </div>

      {showCreate && (
        <Card className="mb-6 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Create Meeting</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="m-title">Meeting Title *</Label>
                <Input id="m-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="e.g. Q2 Board Meeting" />
              </div>
              <div>
                <Label htmlFor="m-date">Date & Time *</Label>
                <Input id="m-date" type="datetime-local" value={form.meeting_date} onChange={(e) => setForm({ ...form, meeting_date: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="m-attendees">Attendees (comma-separated)</Label>
                <Input id="m-attendees" value={form.attendees} onChange={(e) => setForm({ ...form, attendees: e.target.value })} placeholder="Jane Smith, John Doe" />
              </div>
              <div>
                <Label htmlFor="m-absentees">Absentees (comma-separated)</Label>
                <Input id="m-absentees" value={form.absentees} onChange={(e) => setForm({ ...form, absentees: e.target.value })} placeholder="Bob Jones" />
              </div>
            </div>
            <div>
              <Label htmlFor="m-agenda">Agenda Items (one per line)</Label>
              <Textarea id="m-agenda" value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} placeholder="Welcome and apologies&#10;Confirmation of previous minutes&#10;Finance report&#10;..." rows={4} />
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Meeting'}</Button>
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No meetings found.</p>
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="sm:hidden space-y-3">
            {filtered.map((m) => (
              <Link key={m.id} href={`/meetings/${m.id}`}
                className="flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
                <div className="flex-1 min-w-0 pr-3">
                  <p className="font-medium text-slate-900 text-sm truncate">{m.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{formatDate(m.meeting_date)}</p>
                </div>
                <Badge className={STATUS_COLORS[m.status] ?? 'bg-slate-100 text-slate-600'}>
                  {m.status.replace('_', ' ')}
                </Badge>
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-6 py-3 font-medium text-slate-500">Meeting</th>
                  <th className="text-left px-6 py-3 font-medium text-slate-500">Date</th>
                  <th className="text-left px-6 py-3 font-medium text-slate-500 hidden md:table-cell">Status</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-900">{m.title}</td>
                    <td className="px-6 py-4 text-slate-500">{formatDate(m.meeting_date)}</td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <Badge className={STATUS_COLORS[m.status] ?? 'bg-slate-100 text-slate-600'}>
                        {m.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/meetings/${m.id}`} className="text-xs font-medium text-slate-600 hover:text-slate-900">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

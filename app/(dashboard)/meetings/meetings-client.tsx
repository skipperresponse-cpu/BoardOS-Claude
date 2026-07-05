'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { formatDate, cn, MEETING_STATUS_COLORS, MEETING_STATUS_LABELS } from '@/lib/utils'
import { canManageMeetings } from '@/lib/roles'
import type { Meeting, Subcommittee, UserRole } from '@/types'
import { CalendarDays, Plus, Search, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface ProfileOption { id: string; full_name: string; role: string }
interface GuestForm { name: string; affiliation: string; email: string }

interface Props {
  meetings: Meeting[]
  profiles: ProfileOption[]
  subcommittees: Subcommittee[]
  userRole: UserRole
}

export function MeetingsClient({ meetings: initialMeetings, profiles, subcommittees, userRole }: Props) {
  const [meetings, setMeetings] = useState(initialMeetings)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '',
    meeting_date: '',
    agenda_deadline: '',
    subcommittee_id: '',
  })
  const [attendeeIds, setAttendeeIds] = useState<Set<string>>(new Set())
  const [guests, setGuests] = useState<GuestForm[]>([])
  const router = useRouter()
  const supabase = createClient()

  const filtered = meetings.filter((m) =>
    m.title.toLowerCase().includes(search.toLowerCase())
  )

  function selectSubcommittee(subcommitteeId: string) {
    setForm({ ...form, subcommittee_id: subcommitteeId })
    // Auto-populate from the subcommittee's current internal members — manual
    // add/remove afterwards is still allowed, this is just the starting set.
    const sub = subcommittees.find((s) => s.id === subcommitteeId)
    const internalIds = (sub?.members ?? []).map((m) => m.user_id).filter((id): id is string => !!id)
    setAttendeeIds(new Set(internalIds))
  }

  function toggleAttendee(profileId: string) {
    setAttendeeIds((prev) => {
      const next = new Set(prev)
      if (next.has(profileId)) next.delete(profileId)
      else next.add(profileId)
      return next
    })
  }

  function addGuestRow() {
    setGuests((prev) => [...prev, { name: '', affiliation: '', email: '' }])
  }

  function updateGuestRow(index: number, field: keyof GuestForm, value: string) {
    setGuests((prev) => prev.map((g, i) => i === index ? { ...g, [field]: value } : g))
  }

  function removeGuestRow(index: number) {
    setGuests((prev) => prev.filter((_, i) => i !== index))
  }

  function resetForm() {
    setForm({ title: '', meeting_date: '', agenda_deadline: '', subcommittee_id: '' })
    setAttendeeIds(new Set())
    setGuests([])
    setError('')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (attendeeIds.size === 0) {
      setError('At least one internal attendee is required.')
      return
    }
    const validGuests = guests.filter((g) => g.name.trim())

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('id').eq('user_id', user!.id).single()

      const { data: meeting, error: meetingErr } = await supabase
        .from('meetings')
        .insert({
          title: form.title,
          meeting_date: form.meeting_date,
          agenda_deadline: form.agenda_deadline || null,
          subcommittee_id: form.subcommittee_id || null,
          agenda_json: [],
          created_by: profile?.id,
          status: 'draft',
        })
        .select()
        .single()

      if (meetingErr) throw meetingErr

      const attendeeRows = [...attendeeIds].map((userId) => ({
        meeting_id: meeting.id, user_id: userId, invited: true, attended: null,
      }))
      const { error: attendeesErr } = await supabase.from('meeting_attendees').insert(attendeeRows)
      if (attendeesErr) throw attendeesErr

      if (validGuests.length > 0) {
        const guestRows = validGuests.map((g) => ({
          meeting_id: meeting.id, name: g.name.trim(), affiliation: g.affiliation.trim() || null, email: g.email.trim() || null,
        }))
        const { error: guestsErr } = await supabase.from('meeting_guests').insert(guestRows)
        if (guestsErr) throw guestsErr
      }

      setMeetings((prev) => [meeting, ...prev])
      setShowCreate(false)
      resetForm()
      router.push(`/meetings/${meeting.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create meeting')
    } finally {
      setSaving(false)
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
        {canManageMeetings(userRole) && (
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
                <Label htmlFor="m-deadline">Agenda submission deadline</Label>
                <Input id="m-deadline" type="datetime-local" value={form.agenda_deadline} onChange={(e) => setForm({ ...form, agenda_deadline: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="m-subcommittee">Subcommittee scope</Label>
                <Select id="m-subcommittee" value={form.subcommittee_id} onChange={(e) => selectSubcommittee(e.target.value)}>
                  <option value="">General board meeting (no subcommittee)</option>
                  {subcommittees.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
                {form.subcommittee_id && (
                  <p className="text-xs text-slate-500 mt-1">
                    Attendees pre-filled from this subcommittee&apos;s roster — the chair gets standing meeting-management rights automatically.
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label>Internal Attendees * (at least one required)</Label>
              <div className="mt-1 max-h-48 overflow-y-auto border border-slate-200 rounded-md p-2 space-y-1">
                {profiles.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attendeeIds.has(p.id)}
                      onChange={() => toggleAttendee(p.id)}
                      className="rounded border-slate-300"
                    />
                    <span className="text-slate-800">{p.full_name}</span>
                    <span className="text-xs text-slate-400">{p.role}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1">{attendeeIds.size} selected</p>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label>Guests (one-off, this meeting only)</Label>
                <Button type="button" size="sm" variant="outline" onClick={addGuestRow}>
                  <Plus className="h-3.5 w-3.5" /> Add Guest
                </Button>
              </div>
              {guests.length > 0 && (
                <div className="mt-2 space-y-2">
                  {guests.map((g, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <Input placeholder="Name *" value={g.name} onChange={(e) => updateGuestRow(i, 'name', e.target.value)} className="flex-1" />
                      <Input placeholder="Affiliation" value={g.affiliation} onChange={(e) => updateGuestRow(i, 'affiliation', e.target.value)} className="flex-1" />
                      <Input placeholder="Email (optional)" value={g.email} onChange={(e) => updateGuestRow(i, 'email', e.target.value)} className="flex-1" />
                      <button type="button" onClick={() => removeGuestRow(i)} className="p-2 text-slate-400 hover:text-red-500"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <p className="text-xs text-slate-500">
              Meeting is created in Draft status. Open agenda submission from the meeting page when ready.
            </p>
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Meeting'}</Button>
              <Button type="button" variant="secondary" onClick={() => { setShowCreate(false); resetForm() }}>Cancel</Button>
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
                <Badge className={MEETING_STATUS_COLORS[m.status] ?? 'bg-slate-100 text-slate-600'}>
                  {MEETING_STATUS_LABELS[m.status] ?? m.status}
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
                      <Badge className={MEETING_STATUS_COLORS[m.status] ?? 'bg-slate-100 text-slate-600'}>
                        {MEETING_STATUS_LABELS[m.status] ?? m.status}
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

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { MeetingAttendee, MeetingGuest } from '@/types'
import { Check, X, HelpCircle } from 'lucide-react'

interface Props {
  meetingId: string
  attendees: MeetingAttendee[]
  guests: MeetingGuest[]
  canManage: boolean
}

type Attended = boolean | null

function AttendedToggle({ value, onChange, disabled }: { value: Attended; onChange: (v: boolean) => void; disabled: boolean }) {
  if (disabled) {
    return (
      <Badge className={value === true ? 'bg-green-100 text-green-700' : value === false ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}>
        {value === true ? 'Attended' : value === false ? 'Absent' : 'Not confirmed'}
      </Badge>
    )
  }
  return (
    <div className="flex gap-1">
      <button
        onClick={() => onChange(true)}
        className={`p-1.5 rounded transition-colors ${value === true ? 'bg-green-100 text-green-700' : 'text-slate-300 hover:text-green-600 hover:bg-green-50'}`}
        title="Mark attended"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        onClick={() => onChange(false)}
        className={`p-1.5 rounded transition-colors ${value === false ? 'bg-red-100 text-red-700' : 'text-slate-300 hover:text-red-600 hover:bg-red-50'}`}
        title="Mark absent"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// Post-meeting confirmation of who was ACTUALLY present, distinct from who
// was invited/listed. Shown once the meeting reaches Held (or later) as part
// of moving toward minutes drafting — editable while canManage, read-only
// (as a status badge) otherwise.
export function AttendanceConfirmation({ meetingId, attendees: initialAttendees, guests: initialGuests, canManage }: Props) {
  const [attendees, setAttendees] = useState(initialAttendees)
  const [guests, setGuests] = useState(initialGuests)
  const router = useRouter()

  async function setAttendeeAttended(attendeeId: string, attended: boolean) {
    setAttendees((prev) => prev.map((a) => a.id === attendeeId ? { ...a, attended } : a))
    const res = await fetch(`/api/meetings/${meetingId}/attendance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'attendee', id: attendeeId, attended }),
    })
    if (!res.ok) router.refresh()
  }

  async function setGuestAttended(guestId: string, attended: boolean) {
    setGuests((prev) => prev.map((g) => g.id === guestId ? { ...g, attended } : g))
    const res = await fetch(`/api/meetings/${meetingId}/attendance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'guest', id: guestId, attended }),
    })
    if (!res.ok) router.refresh()
  }

  if (attendees.length === 0 && guests.length === 0) return null

  const unconfirmedCount = attendees.filter((a) => a.attended === null).length + guests.filter((g) => g.attended === null).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Attendance Confirmation
          {unconfirmedCount > 0 && (
            <Badge className="bg-amber-100 text-amber-700">
              <HelpCircle className="h-3 w-3 mr-1 inline" />{unconfirmedCount} unconfirmed
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {attendees.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Internal Attendees</p>
            <div className="divide-y divide-slate-100">
              {attendees.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-slate-800">{a.profile?.full_name ?? '—'}</span>
                  <AttendedToggle value={a.attended} onChange={(v) => setAttendeeAttended(a.id, v)} disabled={!canManage} />
                </div>
              ))}
            </div>
          </div>
        )}
        {guests.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Guests</p>
            <div className="divide-y divide-slate-100">
              {guests.map((g) => (
                <div key={g.id} className="flex items-center justify-between py-1.5">
                  <div>
                    <span className="text-sm text-slate-800">{g.name}</span>
                    {g.affiliation && <span className="text-xs text-slate-400 ml-2">{g.affiliation}</span>}
                  </div>
                  <AttendedToggle value={g.attended} onChange={(v) => setGuestAttended(g.id, v)} disabled={!canManage} />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

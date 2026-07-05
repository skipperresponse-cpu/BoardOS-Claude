'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/utils'
import type { MeetingDelegation } from '@/types'
import { UserPlus } from 'lucide-react'

interface ProfileOption { id: string; full_name: string }

interface Props {
  meetingId: string
  boardTierProfiles: ProfileOption[]
  activeDelegation: MeetingDelegation | null
  canGrant: boolean
  currentProfileId: string
}

// Shown to president/secretary (canGrant) to delegate meeting-management
// rights for this one meeting to a board-level user, or to the current
// delegate themselves so they can see their own temporary rights and expiry.
export function MeetingDelegationControl({ meetingId, boardTierProfiles, activeDelegation, canGrant, currentProfileId }: Props) {
  const [showGrant, setShowGrant] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [granting, setGranting] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const isCurrentUserDelegate = activeDelegation?.delegated_to_user_id === currentProfileId

  if (!canGrant && !isCurrentUserDelegate) return null

  async function grantDelegation() {
    if (!selectedUserId) return
    setGranting(true)
    setError('')
    try {
      const res = await fetch(`/api/meetings/${meetingId}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delegatedToUserId: selectedUserId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to delegate')
      setShowGrant(false)
      setSelectedUserId('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delegate')
    } finally {
      setGranting(false)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Delegated Meeting Rights</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {activeDelegation ? (
          <div>
            <p className="text-sm text-slate-800">
              <span className="font-medium">{activeDelegation.delegated_to?.full_name}</span> has temporary
              meeting-management rights for this meeting.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Granted by {activeDelegation.granted_by?.full_name ?? '—'} · expires {formatDateTime(activeDelegation.expires_at)}
            </p>
            {isCurrentUserDelegate && (
              <Badge className="mt-2 bg-amber-100 text-amber-700">Your rights expire {formatDateTime(activeDelegation.expires_at)}</Badge>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic">No active delegation for this meeting.</p>
        )}

        {canGrant && (
          <div>
            {!showGrant ? (
              <Button size="sm" variant="outline" onClick={() => setShowGrant(true)}>
                <UserPlus className="h-3.5 w-3.5" /> Delegate for this meeting
              </Button>
            ) : (
              <div className="space-y-2">
                <Select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="text-sm">
                  <option value="">Select a board member…</option>
                  {boardTierProfiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </Select>
                <p className="text-xs text-slate-500">Rights expire automatically 2 weeks after granting.</p>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <div className="flex gap-2">
                  <Button size="sm" disabled={!selectedUserId || granting} onClick={grantDelegation}>
                    {granting ? 'Delegating…' : 'Grant'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setShowGrant(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

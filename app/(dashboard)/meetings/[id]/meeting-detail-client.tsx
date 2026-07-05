'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ACTION_STATUS_COLORS, MEETING_STATUS_COLORS, MEETING_STATUS_LABELS, formatDate, formatDateTime, cn } from '@/lib/utils'
import { isAdminEquivalent } from '@/lib/roles'
import type { Meeting, ActionItem, ActionItemStatus, UserRole, AgendaItem } from '@/types'
import { Sparkles, Save, Plus, CheckSquare, ArrowRight, Undo2, Ban } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  meeting: Meeting
  actionItems: ActionItem[]
  profiles: Array<{ id: string; full_name: string }>
  userRole: UserRole
  currentProfileId: string
  acknowledgementItems: AgendaItem[]
  // Blanket role tier OR standing subcommittee chair OR an active ad hoc
  // delegation for THIS meeting — computed server-side, see page.tsx.
  canManageThisMeeting: boolean
  // Resolved attendee/guest names for the AI minutes prompt — prefers
  // confirmed meeting_attendees/meeting_guests over the legacy attendees_json
  // snapshot; computed server-side in page.tsx.
  attendeeNames: string[]
  absentNames: string[]
}

// IMPORTANT: must never join to documents or visibility_groups. Per the
// visibility-groups brief (Task 3/4), a resolution's own record — what was
// decided, the vote result, when it was ratified — is part of the official
// board record and stays visible to anyone who can see these minutes,
// regardless of whether some linked document (documents.resolution_id) is
// restricted to a narrower visibility group. Only that document's own
// destination is subject to its visibility group when someone clicks
// through to it — never this acknowledgement entry itself.
function AcknowledgementBlock({ items }: { items: AgendaItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-3 mb-4">
      {items.map((item) => {
        const res = item.resolution
        if (!res) return null
        return (
          <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Resolution Acknowledgement
            </p>
            <p className="text-sm font-medium text-slate-900">{res.title}</p>
            <p className="text-sm text-slate-700 mt-1">{res.content}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-xs text-slate-500">
              <span>Vote result: {res.vote_result ?? 'n/a'}</span>
              <span>Passed: {res.passed_at ? formatDateTime(res.passed_at) : 'n/a'}</span>
              <a href={`/resolutions/${res.id}`} className="text-indigo-600 hover:underline">
                View resolution
              </a>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function MeetingDetailClient({ meeting, actionItems: initialItems, profiles, userRole, currentProfileId, acknowledgementItems, canManageThisMeeting, attendeeNames, absentNames }: Props) {
  const [activeTab, setActiveTab] = useState<'transcript' | 'minutes' | 'actions'>('minutes')
  const [transcript, setTranscript] = useState(meeting.transcript_text ?? '')
  const [draftMinutes, setDraftMinutes] = useState(meeting.draft_minutes ?? '')
  const [finalMinutes, setFinalMinutes] = useState(meeting.final_minutes ?? '')
  const [actionItems, setActionItems] = useState(initialItems)
  const [generatingMinutes, setGeneratingMinutes] = useState(false)
  const [savingMinutes, setSavingMinutes] = useState(false)
  const [approvingMinutes, setApprovingMinutes] = useState(false)
  const [showAddAction, setShowAddAction] = useState(false)
  const [newAction, setNewAction] = useState({ title: '', description: '', owner_user_id: '', due_date: '' })
  const [savingAction, setSavingAction] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const [transitioning, setTransitioning] = useState(false)
  const isAdmin = canManageThisMeeting
  const isHeldOrLater = ['held', 'minutes_drafted', 'minutes_approved'].includes(meeting.status)
  const canCancel = meeting.status !== 'cancelled' && meeting.status !== 'minutes_approved'

  async function transitionTo(toStatus: string) {
    setTransitioning(true)
    const res = await fetch(`/api/meetings/${meeting.id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toStatus }),
    })
    setTransitioning(false)
    if (res.ok) {
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Transition failed')
    }
  }

  async function generateMinutes() {
    setGeneratingMinutes(true)
    const agenda = (meeting.agenda_json as Array<{ title: string }>)
      ?.map((a) => a.title).join('\n') ?? ''

    const res = await fetch('/api/ai/minutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript,
        agenda,
        meetingDetails: {
          title: meeting.title,
          date: meeting.meeting_date,
          attendees: attendeeNames,
          absentees: absentNames,
        },
      }),
    })

    if (res.ok) {
      const data = await res.json()
      setDraftMinutes(data.minutes)

      // Save extracted action items
      if (data.actionItems?.length) {
        const { data: { user } } = await supabase.auth.getUser()
        const { data: profile } = await supabase.from('profiles').select('id').eq('user_id', user!.id).single()

        for (const ai of data.actionItems) {
          const ownerProfile = ai.owner
            ? profiles.find((p) => p.full_name.toLowerCase().includes(ai.owner.toLowerCase()))
            : null

          await supabase.from('action_items').insert({
            meeting_id: meeting.id,
            title: ai.title,
            description: ai.description,
            owner_user_id: ownerProfile?.id ?? null,
            due_date: ai.due_date ?? null,
            status: 'Not Started',
          })
        }
        router.refresh()
      }

      // Save transcript and draft
      await supabase.from('meetings').update({
        transcript_text: transcript,
        draft_minutes: data.minutes,
      }).eq('id', meeting.id)

      // First draft: advance held -> minutes_drafted. Regenerating a draft
      // after that stays at minutes_drafted (transition would be a no-op ladder step).
      if (meeting.status === 'held') {
        await transitionTo('minutes_drafted')
      } else {
        router.refresh()
      }
    }
    setGeneratingMinutes(false)
  }

  async function saveMinutes() {
    setSavingMinutes(true)
    await supabase.from('meetings').update({
      transcript_text: transcript,
      draft_minutes: draftMinutes,
    }).eq('id', meeting.id)
    setSavingMinutes(false)
  }

  async function approveMinutes() {
    setApprovingMinutes(true)
    await supabase.from('meetings').update({
      final_minutes: draftMinutes,
    }).eq('id', meeting.id)
    setFinalMinutes(draftMinutes)
    setApprovingMinutes(false)
    await transitionTo('minutes_approved')
  }

  async function handleAddAction(e: React.FormEvent) {
    e.preventDefault()
    setSavingAction(true)
    const { data: newItem } = await supabase.from('action_items').insert({
      meeting_id: meeting.id,
      title: newAction.title,
      description: newAction.description || null,
      owner_user_id: newAction.owner_user_id || null,
      due_date: newAction.due_date || null,
      status: 'Not Started',
    }).select('*, owner:profiles!owner_user_id(full_name)').single()

    if (newItem) {
      setActionItems((prev) => [...prev, newItem])
      setNewAction({ title: '', description: '', owner_user_id: '', due_date: '' })
      setShowAddAction(false)
    }
    setSavingAction(false)
  }

  async function updateActionStatus(itemId: string, status: ActionItemStatus) {
    await supabase.from('action_items').update({ status }).eq('id', itemId)
    setActionItems((prev) => prev.map((a) => a.id === itemId ? { ...a, status } : a))
  }

  const tabs = [
    { key: 'minutes', label: 'Minutes' },
    { key: 'transcript', label: 'Transcript / Notes' },
    { key: 'actions', label: `Action Items (${actionItems.length})` },
  ] as const

  return (
    <div className="space-y-4">
      {/* Status controls */}
      {isAdmin && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={cn(MEETING_STATUS_COLORS[meeting.status])}>
              {MEETING_STATUS_LABELS[meeting.status] ?? meeting.status}
            </Badge>

            {meeting.status === 'draft' && (
              <Button size="sm" disabled={transitioning} onClick={() => transitionTo('agenda_open')}>
                <ArrowRight className="h-3.5 w-3.5" /> Open Agenda Submission
              </Button>
            )}

            {meeting.status === 'agenda_locked' && (
              <>
                <Button size="sm" disabled={transitioning} onClick={() => transitionTo('scheduled')}>
                  <ArrowRight className="h-3.5 w-3.5" /> Schedule Meeting
                </Button>
                {isAdminEquivalent(userRole) && (
                  <Button size="sm" variant="secondary" disabled={transitioning} onClick={() => transitionTo('agenda_open')}>
                    <Undo2 className="h-3.5 w-3.5" /> Reopen Agenda Submission
                  </Button>
                )}
              </>
            )}

            {meeting.status === 'scheduled' && (
              <Button size="sm" disabled={transitioning} onClick={() => transitionTo('held')}>
                <ArrowRight className="h-3.5 w-3.5" /> Mark as Held
              </Button>
            )}

            {canCancel && (
              <Button size="sm" variant="secondary" disabled={transitioning} onClick={() => {
                if (confirm('Cancel this meeting? This cannot be undone.')) transitionTo('cancelled')
              }}>
                <Ban className="h-3.5 w-3.5" /> Cancel Meeting
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.key
                ? 'border-slate-800 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Transcript Tab */}
      {activeTab === 'transcript' && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {!isHeldOrLater ? (
              <p className="text-sm text-slate-500 italic">
                The meeting must be marked Held before a transcript and minutes can be recorded.
              </p>
            ) : isAdmin ? (
              <>
                <Textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Paste transcript or meeting notes here..."
                  rows={16}
                />
                <div className="flex gap-3">
                  <Button
                    onClick={generateMinutes}
                    disabled={generatingMinutes || !transcript.trim()}
                    variant="primary"
                  >
                    <Sparkles className="h-4 w-4" />
                    {generatingMinutes ? 'Generating...' : 'Generate Minutes with AI'}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500 italic">
                {transcript || 'No transcript recorded.'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Minutes Tab */}
      {activeTab === 'minutes' && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <AcknowledgementBlock items={acknowledgementItems} />
            {meeting.final_minutes ? (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Badge className="bg-green-100 text-green-700">Approved Minutes</Badge>
                </div>
                <div className="prose text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {meeting.final_minutes}
                </div>
              </div>
            ) : !isHeldOrLater ? (
              <p className="text-sm text-slate-500 italic">
                The meeting must be marked Held before minutes can be recorded.
              </p>
            ) : isAdmin ? (
              <>
                <Textarea
                  value={draftMinutes}
                  onChange={(e) => setDraftMinutes(e.target.value)}
                  placeholder="Draft minutes will appear here after AI generation, or type directly..."
                  rows={20}
                />
                <div className="flex gap-3 flex-wrap">
                  <Button onClick={saveMinutes} disabled={savingMinutes} variant="secondary">
                    <Save className="h-4 w-4" />
                    {savingMinutes ? 'Saving...' : 'Save Draft'}
                  </Button>
                  {draftMinutes.trim() && (
                    <Button onClick={approveMinutes} disabled={approvingMinutes}>
                      {approvingMinutes ? 'Approving...' : 'Approve & Finalise Minutes'}
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="prose text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                {meeting.draft_minutes || <p className="text-slate-400 italic">No minutes available yet.</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Items Tab */}
      {activeTab === 'actions' && (
        <div className="space-y-4">
          {isAdmin && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAddAction(!showAddAction)}>
                <Plus className="h-4 w-4" />
                Add Action
              </Button>
            </div>
          )}

          {showAddAction && (
            <Card className="p-4">
              <form onSubmit={handleAddAction} className="space-y-3">
                <div>
                  <Label>Title *</Label>
                  <Input value={newAction.title} onChange={(e) => setNewAction({ ...newAction, title: e.target.value })} required placeholder="What needs to be done?" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Assign To</Label>
                    <Select value={newAction.owner_user_id} onChange={(e) => setNewAction({ ...newAction, owner_user_id: e.target.value })}>
                      <option value="">Unassigned</option>
                      {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label>Due Date</Label>
                    <Input type="date" value={newAction.due_date} onChange={(e) => setNewAction({ ...newAction, due_date: e.target.value })} />
                  </div>
                </div>
                <Textarea value={newAction.description} onChange={(e) => setNewAction({ ...newAction, description: e.target.value })} placeholder="Description (optional)" rows={2} />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={savingAction}>{savingAction ? 'Adding...' : 'Add'}</Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setShowAddAction(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          )}

          {actionItems.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No action items yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {actionItems.map((item) => (
                <Card key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-medium text-slate-900 text-sm">{item.title}</p>
                      {item.description && <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>}
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
                        {(item.owner as { full_name: string } | null)?.full_name && (
                          <span>Owner: {(item.owner as { full_name: string }).full_name}</span>
                        )}
                        {item.due_date && <span>Due: {formatDate(item.due_date)}</span>}
                      </div>
                    </div>
                    <Select
                      value={item.status}
                      onChange={(e) => updateActionStatus(item.id, e.target.value as ActionItemStatus)}
                      className="w-36 text-xs"
                    >
                      {(['Not Started', 'In Progress', 'Done', 'Blocked'] as ActionItemStatus[]).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="mt-2">
                    <Badge className={cn('text-xs', ACTION_STATUS_COLORS[item.status])}>{item.status}</Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

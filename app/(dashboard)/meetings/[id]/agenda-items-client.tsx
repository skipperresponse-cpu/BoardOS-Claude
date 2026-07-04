'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { canSubmitAgendaItems, isAdminEquivalent } from '@/lib/roles'
import type { AgendaItem, MeetingStatus, UserRole } from '@/types'
import { Plus, Check, Pencil, Clock, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  meetingId: string
  meetingStatus: MeetingStatus
  items: AgendaItem[]
  userRole: UserRole
}

const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  edited_approved: 'bg-teal-100 text-teal-700',
  deferred: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
  pending: 'bg-slate-100 text-slate-600',
  noted: 'bg-green-100 text-green-700',
}

export function AgendaItemsClient({ meetingId, meetingStatus, items: initialItems, userRole }: Props) {
  const [items, setItems] = useState(initialItems)
  const [showSubmit, setShowSubmit] = useState(false)
  const [form, setForm] = useState({ title: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ title: '', description: '' })
  const router = useRouter()

  const canSubmit = canSubmitAgendaItems(userRole) && meetingStatus === 'agenda_open'
  const canReview = isAdminEquivalent(userRole) && ['agenda_locked', 'scheduled'].includes(meetingStatus)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/agenda-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId, title: form.title, description: form.description }),
    })
    if (res.ok) {
      const item = await res.json()
      setItems((prev) => [...prev, item])
      setForm({ title: '', description: '' })
      setShowSubmit(false)
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Failed to submit agenda item')
    }
    setSaving(false)
  }

  async function handleAction(id: string, action: string, extra?: Record<string, unknown>) {
    const res = await fetch(`/api/agenda-items/${id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    })
    if (res.ok) {
      router.refresh()
      setEditingId(null)
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Action failed')
    }
  }

  const reviewableItems = items.filter((i) => i.type !== 'acknowledgement')
  const acknowledgementItems = items.filter((i) => i.type === 'acknowledgement')

  return (
    <div className="space-y-4">
      {canSubmit && (
        <div>
          <Button size="sm" variant="outline" onClick={() => setShowSubmit(!showSubmit)}>
            <Plus className="h-3.5 w-3.5" /> Submit Agenda Item
          </Button>
          {showSubmit && (
            <Card className="p-4 mt-2">
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Agenda item title"
                  required
                />
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Description (optional)"
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={saving}>{saving ? 'Submitting...' : 'Submit'}</Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setShowSubmit(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No agenda items yet.</p>
      ) : (
        <div className="space-y-2">
          {reviewableItems.map((item) => (
            <Card key={item.id} className="p-3">
              {editingId === item.id ? (
                <div className="space-y-2">
                  <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                  <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={2} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleAction(item.id, 'edit_approve', { editedTitle: editForm.title, editedDescription: editForm.description })}>
                      Save & Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{item.title}</p>
                    {item.description && <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>}
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge className={STATUS_COLORS[item.status] ?? ''}>{item.status.replace('_', ' ')}</Badge>
                      {item.submitter && <span className="text-xs text-slate-400">by {item.submitter.full_name}</span>}
                    </div>
                  </div>
                  {canReview && item.status === 'submitted' && (
                    <div className="flex gap-1.5 flex-shrink-0">
                      <Button size="sm" variant="outline" onClick={() => handleAction(item.id, 'approve')} title="Approve">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setEditingId(item.id); setEditForm({ title: item.title, description: item.description ?? '' }) }} title="Edit & Approve">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleAction(item.id, 'defer')} title="Defer to unassigned queue">
                        <Clock className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleAction(item.id, 'reject')} title="Reject">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}

          {acknowledgementItems.map((item) => (
            <Card key={item.id} className="p-3 bg-slate-50">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Resolution acknowledgement — no vote required</p>
                </div>
                <Badge className={STATUS_COLORS[item.status] ?? ''}>{item.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

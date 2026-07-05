'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { canSubmitAgendaItems } from '@/lib/roles'
import type { AgendaItem, Document, MeetingStatus, UserRole } from '@/types'
import { Plus, Check, Pencil, Clock, X, Paperclip, Download, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  meetingId: string
  meetingStatus: MeetingStatus
  items: AgendaItem[]
  userRole: UserRole
  currentProfileId: string
  // Blanket role tier OR standing subcommittee chair OR an active ad hoc
  // delegation for THIS meeting — computed server-side (lib/meetings/permissions.ts)
  // since it needs a DB round-trip the client can't do on its own.
  canManageThisMeeting: boolean
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

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md']

function AttachmentsSection({
  item, canManage, onAttach, onRemove, uploading,
}: {
  item: AgendaItem
  canManage: boolean
  onAttach: (item: AgendaItem, file: File) => void
  onRemove: (item: AgendaItem, doc: Document) => void
  uploading: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const attachments = item.attachments ?? []

  if (attachments.length === 0 && !canManage) return null

  return (
    <div className="mt-2 pt-2 border-t border-slate-100">
      {attachments.length > 0 && (
        <ul className="space-y-1 mb-1.5">
          {attachments.map((doc) => (
            <li key={doc.id} className="flex items-center gap-1.5 text-xs">
              <Paperclip className="h-3 w-3 text-slate-400 flex-shrink-0" />
              <a
                href={`/api/documents/${doc.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-600 hover:text-slate-900 hover:underline truncate flex items-center gap-1"
              >
                {doc.title}
                <Download className="h-3 w-3 flex-shrink-0" />
              </a>
              {canManage && (
                <button
                  onClick={() => onRemove(item, doc)}
                  className="text-slate-300 hover:text-red-500 flex-shrink-0"
                  title="Remove pre-read"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept={ALLOWED_EXTENSIONS.join(',')}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onAttach(item, file)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 disabled:opacity-50"
          >
            <Paperclip className="h-3 w-3" />
            {uploading ? 'Uploading…' : 'Attach pre-read'}
          </button>
        </>
      )}
    </div>
  )
}

export function AgendaItemsClient({ meetingId, meetingStatus, items: initialItems, userRole, currentProfileId, canManageThisMeeting }: Props) {
  const [items, setItems] = useState(initialItems)
  const [showSubmit, setShowSubmit] = useState(false)
  const [form, setForm] = useState({ title: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ title: '', description: '' })
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const canSubmit = canSubmitAgendaItems(userRole) && meetingStatus === 'agenda_open'
  const canReview = canManageThisMeeting && ['agenda_locked', 'scheduled'].includes(meetingStatus)

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

  async function handleAttach(item: AgendaItem, file: File) {
    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      alert('Only PDF, DOCX, TXT, and MD files are supported.')
      return
    }
    setUploadingId(item.id)
    try {
      const filePath = `documents/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: storageErr } = await supabase.storage
        .from('governance-docs')
        .upload(filePath, file, { upsert: false })
      if (storageErr) throw storageErr

      const title = file.name.replace(/\.[^/.]+$/, '')
      const res = await fetch(`/api/agenda-items/${item.id}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, title }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to attach pre-read')
      }
      const doc = await res.json()
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, attachments: [...(i.attachments ?? []), doc] } : i))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to attach pre-read')
    } finally {
      setUploadingId(null)
    }
  }

  async function handleRemoveAttachment(item: AgendaItem, doc: Document) {
    if (!confirm(`Remove pre-read "${doc.title}"?`)) return
    const res = await fetch(`/api/agenda-items/${item.id}/attachments?documentId=${doc.id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, attachments: (i.attachments ?? []).filter((d) => d.id !== doc.id) } : i))
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Failed to remove pre-read')
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
          {reviewableItems.map((item) => {
            const canManageAttachment = canManageThisMeeting || item.submitted_by === currentProfileId
            return (
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

              <AttachmentsSection
                item={item}
                canManage={canManageAttachment}
                onAttach={handleAttach}
                onRemove={handleRemoveAttachment}
                uploading={uploadingId === item.id}
              />
            </Card>
            )
          })}

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

'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ACTION_STATUS_COLORS, formatDate, isOverdue, cn, todayDateString } from '@/lib/utils'
import { canManageActionItems } from '@/lib/roles'
import type { ActionItem, ActionItemStatus, UserRole } from '@/types'
import { CheckSquare, Plus, AlertCircle } from 'lucide-react'

interface Props {
  actionItems: ActionItem[]
  profiles: Array<{ id: string; full_name: string }>
  userRole: UserRole
  currentProfileId: string
}

export function ActionItemsClient({ actionItems: initial, profiles, userRole, currentProfileId }: Props) {
  const [items, setItems] = useState(initial)
  const [filter, setFilter] = useState<string>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', owner_user_id: '', due_date: todayDateString(), notes: '' })
  const supabase = createClient()

  const filtered = items.filter((item) => {
    const matchesStatus = filter === 'all' || item.status === filter || (filter === 'overdue' && isOverdue(item.due_date) && item.status !== 'Done')
    const matchesOwner = ownerFilter === 'all' || item.owner_user_id === ownerFilter || (ownerFilter === 'mine' && item.owner_user_id === currentProfileId)
    return matchesStatus && matchesOwner
  })

  async function updateStatus(id: string, status: ActionItemStatus) {
    await supabase.from('action_items').update({ status }).eq('id', id)
    setItems((prev) => prev.map((a) => a.id === id ? { ...a, status } : a))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data: newItem } = await supabase.from('action_items').insert({
      title: form.title,
      description: form.description || null,
      owner_user_id: form.owner_user_id || null,
      due_date: form.due_date || null,
      notes: form.notes || null,
      status: 'Not Started',
    }).select('*, owner:profiles!owner_user_id(full_name)').single()

    if (newItem) {
      setItems((prev) => [newItem, ...prev])
      setForm({ title: '', description: '', owner_user_id: '', due_date: todayDateString(), notes: '' })
      setShowCreate(false)
    }
    setSaving(false)
  }

  const overduCount = items.filter((i) => isOverdue(i.due_date) && i.status !== 'Done').length

  return (
    <div>
      {overduCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {overduCount} overdue action {overduCount === 1 ? 'item' : 'items'}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="sm:w-44">
          <option value="all">All statuses</option>
          <option value="overdue">Overdue</option>
          <option value="Not Started">Not Started</option>
          <option value="In Progress">In Progress</option>
          <option value="Blocked">Blocked</option>
          <option value="Done">Done</option>
        </Select>
        <Select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="sm:w-44">
          <option value="all">All owners</option>
          <option value="mine">Assigned to me</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </Select>
        {canManageActionItems(userRole) && (
          <Button onClick={() => setShowCreate(!showCreate)} className="sm:ml-auto">
            <Plus className="h-4 w-4" />
            Add Action Item
          </Button>
        )}
      </div>

      {showCreate && (
        <Card className="mb-6 p-5">
          <h3 className="font-semibold text-slate-900 mb-4">New Action Item</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="What needs to be done?" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Assign To</Label>
                <Select value={form.owner_user_id} onChange={(e) => setForm({ ...form, owner_user_id: e.target.value })}>
                  <option value="">Unassigned</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </Select>
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Create'}</Button>
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <CheckSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No action items found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const overdue = isOverdue(item.due_date) && item.status !== 'Done'
            return (
              <Card key={item.id} className={cn('p-4', overdue && 'border-red-200')}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-900 text-sm">{item.title}</p>
                      <Badge className={cn(ACTION_STATUS_COLORS[item.status])}>{item.status}</Badge>
                      {overdue && <Badge className="bg-red-100 text-red-600">Overdue</Badge>}
                    </div>
                    {item.description && <p className="text-xs text-slate-500 mt-1">{item.description}</p>}
                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-500">
                      {(item.owner as { full_name: string } | null)?.full_name && (
                        <span>Owner: {(item.owner as { full_name: string }).full_name}</span>
                      )}
                      {item.due_date && (
                        <span className={cn(overdue && 'text-red-600 font-medium')}>
                          Due: {formatDate(item.due_date)}
                        </span>
                      )}
                      {(item.meeting as { title: string } | null)?.title && (
                        <span>From: {(item.meeting as { title: string }).title}</span>
                      )}
                    </div>
                  </div>
                  <Select
                    value={item.status}
                    onChange={(e) => updateStatus(item.id, e.target.value as ActionItemStatus)}
                    className="w-28 sm:w-36 text-xs flex-shrink-0"
                  >
                    {(['Not Started', 'In Progress', 'Done', 'Blocked'] as ActionItemStatus[]).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

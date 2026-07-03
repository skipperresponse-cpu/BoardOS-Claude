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
import { APPROVAL_STATUS_COLORS, formatDate, cn } from '@/lib/utils'
import { isAdminEquivalent } from '@/lib/roles'
import type { ApprovalItem, ApprovalType, UserRole } from '@/types'
import { Vote, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Props {
  approvals: ApprovalItem[]
  documents: Array<{ id: string; title: string }>
  meetings: Array<{ id: string; title: string }>
  userRole: UserRole
  currentProfileId: string
}

export function ApprovalsClient({ approvals: initial, documents, meetings, userRole, currentProfileId }: Props) {
  const [approvals, setApprovals] = useState(initial)
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    summary: '',
    proposal_text: '',
    voting_deadline: '',
    approval_type: 'simple_majority' as ApprovalType,
    show_individual_votes_to_board: false,
    linked_meeting_id: '',
  })
  const router = useRouter()
  const supabase = createClient()

  const filtered = approvals.filter((a) =>
    statusFilter === 'all' || a.status === statusFilter
  )

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('id').eq('user_id', user!.id).single()

    const { data: item } = await supabase.from('approval_items').insert({
      title: form.title,
      summary: form.summary,
      proposal_text: form.proposal_text,
      voting_deadline: form.voting_deadline || null,
      approval_type: form.approval_type,
      show_individual_votes_to_board: form.show_individual_votes_to_board,
      linked_meeting_id: form.linked_meeting_id || null,
      created_by: profile?.id,
      status: 'open',
    }).select('*, creator:profiles!created_by(full_name)').single()

    setSaving(false)
    if (item) {
      setApprovals((prev) => [item, ...prev])
      setShowCreate(false)
      router.push(`/approvals/${item.id}`)
    }
  }

  return (
    <div>
      <div className="flex gap-3 mb-6">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="paused">Paused</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="archived">Archived</option>
        </Select>
        {isAdminEquivalent(userRole) && (
          <Button onClick={() => setShowCreate(!showCreate)} className="ml-auto">
            <Plus className="h-4 w-4" />
            New Approval
          </Button>
        )}
      </div>

      {showCreate && (
        <Card className="mb-6 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Create Approval Item</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="e.g. Approval of 2025 Budget" />
            </div>
            <div>
              <Label>Summary *</Label>
              <Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} required rows={2} placeholder="Brief summary of what is being proposed" />
            </div>
            <div>
              <Label>Full Proposal Text *</Label>
              <Textarea value={form.proposal_text} onChange={(e) => setForm({ ...form, proposal_text: e.target.value })} required rows={6} placeholder="Full proposal, background, and details..." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>Voting Deadline</Label>
                <Input type="datetime-local" value={form.voting_deadline} onChange={(e) => setForm({ ...form, voting_deadline: e.target.value })} />
              </div>
              <div>
                <Label>Approval Type</Label>
                <Select value={form.approval_type} onChange={(e) => setForm({ ...form, approval_type: e.target.value as ApprovalType })}>
                  <option value="simple_majority">Simple Majority</option>
                  <option value="two_thirds">Two-Thirds</option>
                  <option value="unanimous">Unanimous</option>
                </Select>
              </div>
              <div>
                <Label>Linked Meeting</Label>
                <Select value={form.linked_meeting_id} onChange={(e) => setForm({ ...form, linked_meeting_id: e.target.value })}>
                  <option value="">None</option>
                  {meetings.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="show_votes"
                checked={form.show_individual_votes_to_board}
                onChange={(e) => setForm({ ...form, show_individual_votes_to_board: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              <label htmlFor="show_votes" className="text-sm text-slate-700">Show individual votes to board members</label>
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Approval'}</Button>
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Vote className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No approval items found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-6 py-3 font-medium text-slate-500">Proposal</th>
                <th className="text-left px-6 py-3 font-medium text-slate-500 hidden sm:table-cell">Status</th>
                <th className="text-left px-6 py-3 font-medium text-slate-500 hidden md:table-cell">Deadline</th>
                <th className="text-left px-6 py-3 font-medium text-slate-500 hidden lg:table-cell">Type</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-900">{a.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{a.summary}</p>
                  </td>
                  <td className="px-6 py-4 hidden sm:table-cell">
                    <Badge className={cn(APPROVAL_STATUS_COLORS[a.status])}>
                      {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-slate-500 hidden md:table-cell">
                    {formatDate(a.voting_deadline)}
                  </td>
                  <td className="px-6 py-4 text-slate-500 hidden lg:table-cell capitalize">
                    {a.approval_type.replace('_', ' ')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/approvals/${a.id}`} className="text-xs font-medium text-slate-600 hover:text-slate-900">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

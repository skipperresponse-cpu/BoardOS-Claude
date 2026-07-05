'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { canManageSubcommittees } from '@/lib/roles'
import { formatDate } from '@/lib/utils'
import type { Subcommittee, UserRole } from '@/types'
import { Plus, Trash2, ChevronDown, ChevronUp, UserPlus, X } from 'lucide-react'

interface ProfileOption { id: string; full_name: string; role: string }

interface Props {
  subcommittees: Subcommittee[]
  profiles: ProfileOption[]
  userRole: UserRole
}

function MemberRow({ member, onRemove, canManage }: {
  member: NonNullable<Subcommittee['members']>[number]
  onRemove: () => void
  canManage: boolean
}) {
  const isExternal = !member.user_id
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <div className="min-w-0">
        <span className="text-slate-800">
          {isExternal ? member.external_name : member.profile?.full_name}
        </span>
        {isExternal ? (
          <Badge className="ml-2 bg-amber-100 text-amber-700 text-[10px]">External — no system access</Badge>
        ) : (
          <span className="ml-2 text-xs text-slate-400">{member.profile?.role}</span>
        )}
        {isExternal && member.external_affiliation && (
          <p className="text-xs text-slate-400">{member.external_affiliation}</p>
        )}
      </div>
      {canManage && (
        <button onClick={onRemove} className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors flex-shrink-0" title="Remove member">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function SubcommitteeCard({ sub, profiles, canManage }: {
  sub: Subcommittee
  profiles: ProfileOption[]
  canManage: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [showAddInternal, setShowAddInternal] = useState(false)
  const [showAddExternal, setShowAddExternal] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [externalForm, setExternalForm] = useState({ name: '', affiliation: '', email: '' })
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  const members = sub.members ?? []
  const memberUserIds = new Set(members.map((m) => m.user_id).filter(Boolean))
  const availableProfiles = profiles.filter((p) => !memberUserIds.has(p.id))

  async function addInternalMember() {
    if (!selectedUserId) return
    setBusy(true)
    const res = await fetch(`/api/subcommittees/${sub.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: selectedUserId }),
    })
    setBusy(false)
    if (res.ok) {
      setSelectedUserId('')
      setShowAddInternal(false)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Failed to add member')
    }
  }

  async function addExternalMember() {
    if (!externalForm.name.trim()) return
    setBusy(true)
    const res = await fetch(`/api/subcommittees/${sub.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        external_name: externalForm.name,
        external_affiliation: externalForm.affiliation,
        external_email: externalForm.email,
      }),
    })
    setBusy(false)
    if (res.ok) {
      setExternalForm({ name: '', affiliation: '', email: '' })
      setShowAddExternal(false)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Failed to add member')
    }
  }

  async function removeMember(memberId: string) {
    if (!confirm('Remove this member from the subcommittee?')) return
    const res = await fetch(`/api/subcommittees/${sub.id}/members/${memberId}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
    else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Failed to remove member')
    }
  }

  async function changeChair(chairUserId: string) {
    const res = await fetch(`/api/subcommittees/${sub.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chair_user_id: chairUserId || null }),
    })
    if (res.ok) router.refresh()
    else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Failed to change chair')
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{sub.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {sub.term_start ? formatDate(sub.term_start) : 'No start date'}
            {' – '}
            {sub.term_end ? formatDate(sub.term_end) : 'Ongoing'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Chair: {sub.chair?.full_name ?? <span className="italic text-slate-400">None assigned</span>}
          </p>
        </div>
        <button onClick={() => setExpanded((v) => !v)} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
          {canManage && (
            <div>
              <Label htmlFor={`chair-${sub.id}`}>Chair</Label>
              <Select
                id={`chair-${sub.id}`}
                value={sub.chair_user_id ?? ''}
                onChange={(e) => changeChair(e.target.value)}
                className="text-sm"
              >
                <option value="">No chair assigned</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Members ({members.length})
            </p>
            {members.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No members yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {members.map((m) => (
                  <MemberRow key={m.id} member={m} canManage={canManage} onRemove={() => removeMember(m.id)} />
                ))}
              </div>
            )}
          </div>

          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { setShowAddInternal((v) => !v); setShowAddExternal(false) }}>
                <UserPlus className="h-3.5 w-3.5" /> Add Internal Member
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowAddExternal((v) => !v); setShowAddInternal(false) }}>
                <UserPlus className="h-3.5 w-3.5" /> Add External Member
              </Button>
            </div>
          )}

          {showAddInternal && (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label htmlFor={`add-internal-${sub.id}`}>Board / system user</Label>
                <Select id={`add-internal-${sub.id}`} value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="text-sm">
                  <option value="">Select a person…</option>
                  {availableProfiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>
                  ))}
                </Select>
              </div>
              <Button size="sm" disabled={!selectedUserId || busy} onClick={addInternalMember}>Add</Button>
              <button onClick={() => setShowAddInternal(false)} className="p-2 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
          )}

          {showAddExternal && (
            <div className="space-y-2 p-3 bg-slate-50 rounded-md">
              <Input placeholder="Name *" value={externalForm.name} onChange={(e) => setExternalForm({ ...externalForm, name: e.target.value })} />
              <Input placeholder="Affiliation (e.g. Legal Advisor)" value={externalForm.affiliation} onChange={(e) => setExternalForm({ ...externalForm, affiliation: e.target.value })} />
              <Input placeholder="Email (optional)" value={externalForm.email} onChange={(e) => setExternalForm({ ...externalForm, email: e.target.value })} />
              <p className="text-xs text-slate-400">External members have no system access — this is a roster record only.</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={!externalForm.name.trim() || busy} onClick={addExternalMember}>Add</Button>
                <Button size="sm" variant="secondary" onClick={() => setShowAddExternal(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export function SubcommitteesClient({ subcommittees: initial, profiles, userRole }: Props) {
  const [subcommittees, setSubcommittees] = useState(initial)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', term_start: '', term_end: '', chair_user_id: '' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const canManage = canManageSubcommittees(userRole)

  // All mutations below (create, member add/remove, chair change) call
  // router.refresh() rather than hand-rolling optimistic updates — this
  // syncs local state back to the freshly re-fetched server data (a plain
  // useState(initial) only reads its initial value once and otherwise goes
  // stale across refreshes). Confirmed live: without this, a newly-assigned
  // chair silently showed as "None assigned" until a hard reload.
  useEffect(() => setSubcommittees(initial), [initial])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/subcommittees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create subcommittee')
      setForm({ name: '', term_start: '', term_end: '', chair_user_id: '' })
      setShowCreate(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create subcommittee')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      {canManage && (
        <div className="flex justify-end mb-4">
          <Button onClick={() => setShowCreate((v) => !v)}>
            <Plus className="h-4 w-4" /> New Subcommittee
          </Button>
        </div>
      )}

      {showCreate && (
        <Card className="mb-6 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">New Subcommittee</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label htmlFor="sub-name">Name *</Label>
              <Input id="sub-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Finance & Remuneration" required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sub-start">Term Start</Label>
                <Input id="sub-start" type="date" value={form.term_start} onChange={(e) => setForm({ ...form, term_start: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="sub-end">Term End (leave blank if ongoing)</Label>
                <Input id="sub-end" type="date" value={form.term_end} onChange={(e) => setForm({ ...form, term_end: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="sub-chair">Chair</Label>
              <Select id="sub-chair" value={form.chair_user_id} onChange={(e) => setForm({ ...form, chair_user_id: e.target.value })}>
                <option value="">No chair assigned yet</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>
                ))}
              </Select>
            </div>
            {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
            <div className="flex gap-3">
              <Button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create'}</Button>
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {subcommittees.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No subcommittees yet.</p>
      ) : (
        <div className="space-y-3">
          {subcommittees.map((sub) => (
            <SubcommitteeCard key={sub.id} sub={sub} profiles={profiles} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  )
}

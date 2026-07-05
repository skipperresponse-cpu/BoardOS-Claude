'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ROLE_LABELS } from '@/lib/roles'
import type { VisibilityGroup, UserRole } from '@/types'
import { Plus, Trash2, ChevronDown, ChevronUp, UserPlus, X } from 'lucide-react'

interface ProfileOption { id: string; full_name: string; role: string }
interface SubcommitteeOption { id: string; name: string }

interface Props {
  groups: VisibilityGroup[]
  profiles: ProfileOption[]
  subcommittees: SubcommitteeOption[]
}

function GroupCard({ group, profiles }: { group: VisibilityGroup; profiles: ProfileOption[] }) {
  const [expanded, setExpanded] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  const members = group.members ?? []
  const memberUserIds = new Set(members.map((m) => m.user_id))
  const availableProfiles = profiles.filter((p) => !memberUserIds.has(p.id))

  async function addMember() {
    if (!selectedUserId) return
    setBusy(true)
    const res = await fetch(`/api/visibility-groups/${group.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: selectedUserId }),
    })
    setBusy(false)
    if (res.ok) {
      setSelectedUserId('')
      setShowAddMember(false)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Failed to add member')
    }
  }

  async function removeMember(memberId: string) {
    if (!confirm('Remove this person from the group?')) return
    const res = await fetch(`/api/visibility-groups/${group.id}/members/${memberId}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
    else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Failed to remove member')
    }
  }

  async function deleteGroup() {
    if (!confirm(`Delete visibility group "${group.name}"? Any folder or document still using it will need reassignment first.`)) return
    const res = await fetch(`/api/visibility-groups/${group.id}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
    else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Failed to delete group')
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-900">{group.name}</p>
            {group.is_system && <Badge className="bg-slate-100 text-slate-500 text-[10px]">System</Badge>}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {group.membership_type === 'role_based' && `Role-based: ${(group.allowed_roles ?? []).map((r) => ROLE_LABELS[r as UserRole] ?? r).join(', ')}`}
            {group.membership_type === 'subcommittee' && `Linked to subcommittee: ${group.subcommittee?.name ?? '—'}`}
            {group.membership_type === 'static' && `Custom list (${members.length} ${members.length === 1 ? 'person' : 'people'})`}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!group.is_system && (
            <button onClick={deleteGroup} className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors" title="Delete group">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={() => setExpanded((v) => !v)} className="text-slate-400 hover:text-slate-600">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
          {group.membership_type === 'role_based' && (
            <p className="text-sm text-slate-500 italic">
              Membership tracks these roles automatically — anyone with one of these roles is a member, no manual list to maintain.
            </p>
          )}

          {group.membership_type === 'subcommittee' && (
            <p className="text-sm text-slate-500 italic">
              Membership mirrors {group.subcommittee?.name ?? 'this subcommittee'}&apos;s internal roster automatically — manage it from the Subcommittees page.
            </p>
          )}

          {group.membership_type === 'static' && (
            <>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Members ({members.length})
                </p>
                {members.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No members yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center justify-between py-1.5 text-sm">
                        <span className="text-slate-800">{m.profile?.full_name ?? '—'}</span>
                        <button onClick={() => removeMember(m.id)} className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors" title="Remove">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!showAddMember ? (
                <Button size="sm" variant="outline" onClick={() => setShowAddMember(true)}>
                  <UserPlus className="h-3.5 w-3.5" /> Add Member
                </Button>
              ) : (
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="text-sm">
                      <option value="">Select a person…</option>
                      {availableProfiles.map((p) => (
                        <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>
                      ))}
                    </Select>
                  </div>
                  <Button size="sm" disabled={!selectedUserId || busy} onClick={addMember}>Add</Button>
                  <button onClick={() => setShowAddMember(false)} className="p-2 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  )
}

export function AdminVisibilityGroups({ groups: initial, profiles, subcommittees }: Props) {
  const [groups, setGroups] = useState(initial)
  // A plain useState(initial) only reads its initial value once, so it goes
  // stale after router.refresh() brings in fresh server data. Resetting state
  // during render (React's documented pattern for "adjusting state when a
  // prop changes") rather than in a useEffect avoids an extra render pass and
  // the lint warning that comes with syncing state in an effect.
  const [prevInitial, setPrevInitial] = useState(initial)
  if (initial !== prevInitial) {
    setPrevInitial(initial)
    setGroups(initial)
  }
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', membershipType: 'static' as 'static' | 'subcommittee', subcommitteeId: '' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    if (form.membershipType === 'subcommittee' && !form.subcommitteeId) {
      setError('Select a subcommittee to link this group to.')
      return
    }
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/visibility-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, membershipType: form.membershipType, subcommitteeId: form.subcommitteeId || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create group')
      setForm({ name: '', membershipType: 'static', subcommitteeId: '' })
      setShowCreate(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setShowCreate((v) => !v)}>
          <Plus className="h-4 w-4" /> New Visibility Group
        </Button>
      </div>

      {showCreate && (
        <Card className="mb-6 p-6">
          <h4 className="font-semibold text-slate-900 mb-4">New Visibility Group</h4>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label htmlFor="vg-name">Name *</Label>
              <Input id="vg-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Grant Committee" required />
            </div>
            <div>
              <Label htmlFor="vg-type">Membership</Label>
              <Select id="vg-type" value={form.membershipType} onChange={(e) => setForm({ ...form, membershipType: e.target.value as 'static' | 'subcommittee' })}>
                <option value="static">Custom list of people</option>
                <option value="subcommittee">Linked to a subcommittee&apos;s roster</option>
              </Select>
            </div>
            {form.membershipType === 'subcommittee' && (
              <div>
                <Label htmlFor="vg-subcommittee">Subcommittee</Label>
                <Select id="vg-subcommittee" value={form.subcommitteeId} onChange={(e) => setForm({ ...form, subcommitteeId: e.target.value })}>
                  <option value="">Select a subcommittee…</option>
                  {subcommittees.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </div>
            )}
            {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
            <div className="flex gap-3">
              <Button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create'}</Button>
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No visibility groups yet.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} profiles={profiles} />
          ))}
        </div>
      )}
    </div>
  )
}

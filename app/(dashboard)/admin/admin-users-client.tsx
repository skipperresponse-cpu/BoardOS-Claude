'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import type { Profile, UserRole } from '@/types'
import { Plus, User } from 'lucide-react'

interface Props {
  profiles: Profile[]
}

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  board_member: 'bg-blue-100 text-blue-700',
  viewer: 'bg-slate-100 text-slate-600',
}

export function AdminUsersClient({ profiles: initial }: Props) {
  const [profiles, setProfiles] = useState(initial)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'board_member' as UserRole })
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const supabase = createClient()

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setInviteError('')

    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inviteForm),
    })

    if (!res.ok) {
      const data = await res.json()
      setInviteError(data.error ?? 'Invite failed')
    } else {
      setShowInvite(false)
      setInviteForm({ email: '', full_name: '', role: 'board_member' })
    }
    setInviting(false)
  }

  async function updateRole(profileId: string, role: UserRole) {
    await supabase.from('profiles').update({ role }).eq('id', profileId)
    setProfiles((prev) => prev.map((p) => p.id === profileId ? { ...p, role } : p))
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={() => setShowInvite(!showInvite)}>
          <Plus className="h-4 w-4" />
          Invite User
        </Button>
      </div>

      {showInvite && (
        <Card className="mb-6 p-5">
          <h4 className="font-semibold text-slate-900 mb-3">Invite New User</h4>
          <form onSubmit={handleInvite} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Email *</Label>
                <Input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} required placeholder="user@example.com" />
              </div>
              <div>
                <Label>Full Name *</Label>
                <Input value={inviteForm.full_name} onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })} required placeholder="Jane Smith" />
              </div>
              <div>
                <Label>Role *</Label>
                <Select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as UserRole })}>
                  <option value="board_member">Board Member</option>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </Select>
              </div>
            </div>
            {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
            <div className="flex gap-3">
              <Button type="submit" size="sm" disabled={inviting}>{inviting ? 'Inviting...' : 'Send Invite'}</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setShowInvite(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-6 py-3 font-medium text-slate-500">Name</th>
              <th className="text-left px-6 py-3 font-medium text-slate-500 hidden sm:table-cell">Email</th>
              <th className="text-left px-6 py-3 font-medium text-slate-500">Role</th>
              <th className="text-left px-6 py-3 font-medium text-slate-500 hidden md:table-cell">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profiles.map((p) => (
              <tr key={p.id}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold">
                      {p.full_name.charAt(0)}
                    </div>
                    <span className="font-medium text-slate-900">{p.full_name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-500 hidden sm:table-cell">{p.email}</td>
                <td className="px-6 py-4">
                  <Select
                    value={p.role}
                    onChange={(e) => updateRole(p.id, e.target.value as UserRole)}
                    className="w-36 text-xs"
                  >
                    <option value="admin">Admin</option>
                    <option value="board_member">Board Member</option>
                    <option value="viewer">Viewer</option>
                  </Select>
                </td>
                <td className="px-6 py-4 text-slate-500 hidden md:table-cell">{formatDate(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

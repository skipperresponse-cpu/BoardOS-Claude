'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { formatDate } from '@/lib/utils'
import type { Profile, UserRole } from '@/types'
import {
  Plus, UserPlus, Mail, RefreshCw, Copy, Check,
  CheckCircle2, X, Eye, EyeOff, ChevronDown,
} from 'lucide-react'

interface Props {
  profiles: Profile[]
}

const ROLE_COLORS: Record<UserRole, string> = {
  admin:        'bg-purple-100 text-purple-700',
  board_member: 'bg-blue-100 text-blue-700',
  viewer:       'bg-slate-100 text-slate-600',
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin:        'Admin',
  board_member: 'Board Member',
  viewer:       'Viewer',
}

// ─── Password generator ───────────────────────────────────────────────────────

function generatePassword(): string {
  const upper  = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower  = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const spec   = '@#$!'
  const all    = upper + lower + digits
  let pwd = ''
  pwd += upper[Math.floor(Math.random() * upper.length)]
  pwd += spec[Math.floor(Math.random() * spec.length)]
  pwd += digits[Math.floor(Math.random() * digits.length)]
  for (let i = 0; i < 7; i++) pwd += all[Math.floor(Math.random() * all.length)]
  return pwd.split('').sort(() => Math.random() - 0.5).join('')
}

// ─── Credentials card ─────────────────────────────────────────────────────────

function CredentialsCard({
  email, password, name, onClose,
}: { email: string; password: string; name: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login'

  const text =
    `Your BoardOS login details:\n\nName: ${name}\nEmail: ${email}\nPassword: ${password}\nLogin at: ${loginUrl}`

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          <span className="text-sm font-semibold text-emerald-800">User created — share these login details</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="bg-white rounded-lg border border-emerald-200 px-4 py-3 font-mono text-sm space-y-1 text-slate-700 select-all">
        <p><span className="text-slate-400">Name:</span> {name}</p>
        <p><span className="text-slate-400">Email:</span> {email}</p>
        <p><span className="text-slate-400">Password:</span> {password}</p>
        <p><span className="text-slate-400">Login:</span> {loginUrl}</p>
      </div>

      <button
        onClick={handleCopy}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
      >
        {copied
          ? <><Check className="h-4 w-4" /> Copied!</>
          : <><Copy className="h-4 w-4" /> Copy login details</>
        }
      </button>
      <p className="mt-2 text-xs text-emerald-700 opacity-70">
        Paste directly into WhatsApp, email, or any messaging app.
      </p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type Mode = null | 'create' | 'invite'

export function AdminUsersClient({ profiles: initial }: Props) {
  const [profiles, setProfiles]     = useState(initial)
  const [mode, setMode]             = useState<Mode>(null)

  // Create-user form
  const [form, setForm]             = useState({ email: '', full_name: '', role: 'board_member' as UserRole, password: generatePassword() })
  const [showPwd, setShowPwd]       = useState(false)
  const [creating, setCreating]     = useState(false)
  const [createError, setCreateError] = useState('')
  const [credentials, setCredentials] = useState<{ email: string; password: string; name: string } | null>(null)

  // Invite form
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'board_member' as UserRole })
  const [inviting, setInviting]     = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSent, setInviteSent] = useState(false)

  const supabase = createClient()

  function openMode(m: Mode) {
    setMode(prev => prev === m ? null : m)
    setCreateError('')
    setInviteError('')
    setInviteSent(false)
    setCredentials(null)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateError('')
    setCredentials(null)

    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()

    if (!res.ok) {
      setCreateError(data.error ?? 'Failed to create user')
    } else {
      setCredentials({ email: form.email, password: form.password, name: form.full_name })
      setProfiles(prev => [...prev, {
        id: data.userId ?? Date.now().toString(),
        user_id: data.userId ?? '',
        full_name: form.full_name,
        email: form.email,
        role: form.role,
        created_at: new Date().toISOString(),
      }])
      setForm({ email: '', full_name: '', role: 'board_member', password: generatePassword() })
    }
    setCreating(false)
  }

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
      setInviteSent(true)
      setInviteForm({ email: '', full_name: '', role: 'board_member' })
    }
    setInviting(false)
  }

  async function updateRole(profileId: string, role: UserRole) {
    await supabase.from('profiles').update({ role }).eq('id', profileId)
    setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, role } : p))
  }

  return (
    <div>
      {/* ── Action buttons ── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => openMode('create')}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
            mode === 'create'
              ? 'bg-indigo-600 text-white'
              : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
          }`}
        >
          <UserPlus className="h-4 w-4" />
          Create User
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${mode === 'create' ? 'rotate-180' : ''}`} />
        </button>

        <button
          onClick={() => openMode('invite')}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
            mode === 'invite'
              ? 'bg-slate-700 text-white'
              : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Mail className="h-4 w-4" />
          Invite by email
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${mode === 'invite' ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* ── Create User panel ── */}
      {mode === 'create' && (
        <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50/50 p-5">
          <h4 className="text-sm font-semibold text-slate-900 mb-1">Create user with password</h4>
          <p className="text-xs text-slate-500 mb-4">Account is created immediately. No email sent — share credentials manually.</p>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-slate-600 mb-1 block">Full Name *</Label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })}
                  required
                  placeholder="Jane Smith"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600 mb-1 block">Email *</Label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  required
                  placeholder="jane@example.com"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600 mb-1 block">Password *</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      required
                      minLength={8}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-9 text-sm text-slate-900 font-mono focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, password: generatePassword() })}
                    title="Generate new password"
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Minimum 8 characters. Click <RefreshCw className="h-2.5 w-2.5 inline" /> to regenerate.</p>
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600 mb-1 block">Role *</Label>
                <Select
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value as UserRole })}
                  className="w-full"
                >
                  <option value="board_member">Board Member</option>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </Select>
              </div>
            </div>

            {createError && <p className="text-sm text-red-600">{createError}</p>}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
              >
                {creating ? 'Creating…' : <><Plus className="h-4 w-4" /> Create User</>}
              </button>
              <button
                type="button"
                onClick={() => { setMode(null); setCredentials(null) }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>

          {/* Credentials card */}
          {credentials && (
            <CredentialsCard
              email={credentials.email}
              password={credentials.password}
              name={credentials.name}
              onClose={() => setCredentials(null)}
            />
          )}
        </div>
      )}

      {/* ── Invite by email panel ── */}
      {mode === 'invite' && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h4 className="text-sm font-semibold text-slate-900 mb-1">Invite by email</h4>
          <p className="text-xs text-slate-500 mb-4">Supabase sends the user a sign-up link to set their own password.</p>

          {inviteSent ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium">
              <CheckCircle2 className="h-4 w-4" /> Invite sent to {inviteForm.email || 'user'}.
              <button onClick={() => { setInviteSent(false) }} className="ml-2 underline text-slate-500 text-xs">Send another</button>
            </div>
          ) : (
            <form onSubmit={handleInvite} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-medium text-slate-600 mb-1 block">Email *</Label>
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                    required
                    placeholder="user@example.com"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-600 mb-1 block">Full Name *</Label>
                  <input
                    type="text"
                    value={inviteForm.full_name}
                    onChange={e => setInviteForm({ ...inviteForm, full_name: e.target.value })}
                    required
                    placeholder="Jane Smith"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-600 mb-1 block">Role *</Label>
                  <Select value={inviteForm.role} onChange={e => setInviteForm({ ...inviteForm, role: e.target.value as UserRole })}>
                    <option value="board_member">Board Member</option>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </Select>
                </div>
              </div>
              {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={inviting}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  {inviting ? 'Sending…' : 'Send Invite'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode(null)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Users table ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Email</th>
              <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profiles.map(p => (
              <tr key={p.id} className="hover:bg-slate-50/50">
                <td className="px-4 sm:px-6 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                      {p.full_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-slate-900 text-sm">{p.full_name}</span>
                  </div>
                </td>
                <td className="px-6 py-3.5 text-slate-500 hidden sm:table-cell text-sm">{p.email}</td>
                <td className="px-4 sm:px-6 py-3.5">
                  <Select
                    value={p.role}
                    onChange={e => updateRole(p.id, e.target.value as UserRole)}
                    className="w-36 text-xs"
                  >
                    <option value="admin">Admin</option>
                    <option value="board_member">Board Member</option>
                    <option value="viewer">Viewer</option>
                  </Select>
                </td>
                <td className="px-6 py-3.5 text-slate-400 text-xs hidden md:table-cell">{formatDate(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

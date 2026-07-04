'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDate } from '@/lib/utils'
import { canFlagForResolution } from '@/lib/roles'
import type { Resolution, ResolutionPassMode, UserRole } from '@/types'
import { Gavel, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Props {
  resolutions: Resolution[]
  formalisableApprovals: Array<{ id: string; title: string; status: string; closed_at: string | null }>
  userRole: UserRole
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  circulated: 'bg-blue-100 text-blue-700',
  passed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  noted: 'bg-teal-100 text-teal-700',
}

export function ResolutionsClient({ resolutions: initial, formalisableApprovals, userRole }: Props) {
  const [resolutions, setResolutions] = useState(initial)
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [showFormalise, setShowFormalise] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '', content: '', passMode: 'unanimous' as ResolutionPassMode,
    thresholdValue: '', thresholdIsCount: false, thresholdReference: '',
  })
  const [formaliseId, setFormaliseId] = useState('')
  const router = useRouter()

  const canCreate = canFlagForResolution(userRole)
  const filtered = resolutions.filter((r) => statusFilter === 'all' || r.status === statusFilter)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/resolutions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        content: form.content,
        passMode: form.passMode,
        thresholdValue: form.passMode === 'threshold' ? Number(form.thresholdValue) : undefined,
        thresholdIsCount: form.thresholdIsCount,
        thresholdReference: form.thresholdReference || undefined,
      }),
    })
    setSaving(false)
    if (res.ok) {
      const item = await res.json()
      router.push(`/resolutions/${item.id}`)
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Failed to create resolution')
    }
  }

  async function handleFormalise(e: React.FormEvent) {
    e.preventDefault()
    if (!formaliseId) return
    setSaving(true)
    const res = await fetch('/api/resolutions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        content: form.content,
        passMode: form.passMode,
        thresholdValue: form.passMode === 'threshold' ? Number(form.thresholdValue) : undefined,
        thresholdIsCount: form.thresholdIsCount,
        thresholdReference: form.thresholdReference || undefined,
        existingApprovalItemId: formaliseId,
      }),
    })
    setSaving(false)
    if (res.ok) {
      const item = await res.json()
      router.push(`/resolutions/${item.id}`)
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Failed to formalise resolution')
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-6">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="circulated">Circulated</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="noted">Noted</option>
        </Select>
        {canCreate && (
          <div className="ml-auto flex gap-2">
            {formalisableApprovals.length > 0 && (
              <Button variant="secondary" onClick={() => { setShowFormalise(!showFormalise); setShowCreate(false) }}>
                Formalise Approved Item
              </Button>
            )}
            <Button onClick={() => { setShowCreate(!showCreate); setShowFormalise(false) }}>
              <Plus className="h-4 w-4" /> New Resolution
            </Button>
          </div>
        )}
      </div>

      {showFormalise && (
        <Card className="mb-6 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Formalise an Approved Item as a Resolution</h3>
          <form onSubmit={handleFormalise} className="space-y-4">
            <div>
              <Label>Approved Item *</Label>
              <Select value={formaliseId} onChange={(e) => setFormaliseId(e.target.value)} required>
                <option value="">Select an approved item...</option>
                {formalisableApprovals.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </Select>
            </div>
            <ResolutionFormFields form={form} setForm={setForm} />
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>{saving ? 'Formalising...' : 'Formalise'}</Button>
              <Button type="button" variant="secondary" onClick={() => setShowFormalise(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {showCreate && (
        <Card className="mb-6 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Create Resolution</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <ResolutionFormFields form={form} setForm={setForm} />
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Save as Draft'}</Button>
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Gavel className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No resolutions found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-6 py-3 font-medium text-slate-500">Title</th>
                <th className="text-left px-6 py-3 font-medium text-slate-500 hidden sm:table-cell">Status</th>
                <th className="text-left px-6 py-3 font-medium text-slate-500 hidden md:table-cell">Pass Mode</th>
                <th className="text-left px-6 py-3 font-medium text-slate-500 hidden lg:table-cell">Passed</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-900">{r.title}</td>
                  <td className="px-6 py-4 hidden sm:table-cell">
                    <Badge className={STATUS_COLORS[r.status] ?? ''}>{r.status}</Badge>
                  </td>
                  <td className="px-6 py-4 text-slate-500 hidden md:table-cell capitalize">{r.pass_mode}</td>
                  <td className="px-6 py-4 text-slate-500 hidden lg:table-cell">
                    {r.passed_at ? formatDate(r.passed_at) : '—'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/resolutions/${r.id}`} className="text-xs font-medium text-slate-600 hover:text-slate-900">
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

interface FormState {
  title: string
  content: string
  passMode: ResolutionPassMode
  thresholdValue: string
  thresholdIsCount: boolean
  thresholdReference: string
}

function ResolutionFormFields({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  return (
    <>
      <div>
        <Label>Title *</Label>
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="What decision is this about?" />
      </div>
      <div>
        <Label>Content *</Label>
        <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required rows={5} placeholder="The full resolution text..." />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Pass Mode</Label>
          <Select value={form.passMode} onChange={(e) => setForm({ ...form, passMode: e.target.value as ResolutionPassMode })}>
            <option value="unanimous">Unanimous</option>
            <option value="threshold">Threshold</option>
          </Select>
        </div>
        {form.passMode === 'threshold' && (
          <div>
            <Label>Required {form.thresholdIsCount ? 'Count' : 'Percentage'} *</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={form.thresholdValue}
                onChange={(e) => setForm({ ...form, thresholdValue: e.target.value })}
                required
                placeholder={form.thresholdIsCount ? 'e.g. 5' : 'e.g. 60'}
              />
              <label className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={form.thresholdIsCount}
                  onChange={(e) => setForm({ ...form, thresholdIsCount: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Raw count
              </label>
            </div>
          </div>
        )}
      </div>
      {form.passMode === 'threshold' && (
        <div>
          <Label>Threshold Reference (optional)</Label>
          <Input
            value={form.thresholdReference}
            onChange={(e) => setForm({ ...form, thresholdReference: e.target.value })}
            placeholder="e.g. Financial Manual clause 4.2"
          />
        </div>
      )}
    </>
  )
}

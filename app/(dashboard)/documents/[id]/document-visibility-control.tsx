'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

interface Props {
  documentId: string
  currentGroupId: string
  currentGroupName: string
  groups: Array<{ id: string; name: string }>
}

// Who can reach this control: the uploader, plus President/Secretary — not
// open to anyone with general document-manage rights (gated by the caller).
export function DocumentVisibilityControl({ documentId, currentGroupId, currentGroupName, groups }: Props) {
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState(currentGroupId)
  const [groupName, setGroupName] = useState(currentGroupName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSave() {
    if (selected === currentGroupId) { setEditing(false); return }
    const targetGroup = groups.find((g) => g.id === selected)
    if (!targetGroup) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/documents/${documentId}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibilityGroupId: selected }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to change visibility')
      setGroupName(targetGroup.name)
      setEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change visibility')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <Badge className="bg-amber-50 text-amber-700">{groupName}</Badge>
        <button
          onClick={() => { setSelected(currentGroupId); setEditing(true) }}
          className="text-xs text-slate-500 hover:text-slate-800 underline"
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Select value={selected} onChange={(e) => setSelected(e.target.value)} className="text-sm w-full sm:w-56">
        {groups.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </Select>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

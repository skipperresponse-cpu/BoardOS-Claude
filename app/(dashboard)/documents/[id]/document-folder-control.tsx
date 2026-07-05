'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

interface Props {
  documentId: string
  currentFolderId: string | null
  currentFolderName: string
  folders: Array<{ id: string; name: string }>
}

// The single deliberate entry point for changing a document's folder —
// President/Secretary only (canRecategorizeDocuments), gated by the caller.
// Deliberately absent from every list/grid view; a confirmation dialog is
// required before the change takes effect, no silent one-click move.
export function DocumentFolderControl({ documentId, currentFolderId, currentFolderName, folders }: Props) {
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState(currentFolderId ?? '')
  const [folderName, setFolderName] = useState(currentFolderName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleMove() {
    if (selected === currentFolderId) { setEditing(false); return }
    const targetFolder = folders.find((f) => f.id === selected)
    if (!targetFolder) return
    if (!confirm(`Move this document to "${targetFolder.name}"? This will change where it appears in the directory.`)) {
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/documents/${documentId}/folder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: selected }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to move document')
      setFolderName(targetFolder.name)
      setEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move document')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <Badge className="bg-slate-100 text-slate-700">{folderName}</Badge>
        <button
          onClick={() => { setSelected(currentFolderId ?? ''); setEditing(true) }}
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
        {folders.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </Select>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleMove} disabled={saving}>
          {saving ? 'Moving…' : 'Move'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
